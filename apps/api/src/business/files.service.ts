import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, stat, statfs, unlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createConnection } from "node:net";
import type { Response } from "express";
import type { PortalRequest } from "../http";
import { BusinessService } from "./business.service";
import type { Transaction } from "../identity/authorization.service";
import { fileType } from "./file-types";
export { fileType } from "./file-types";

export const MAX_UPLOAD = 25 * 1024 * 1024;
export type ReceivedFile = {
  filename: string;
  mime: string;
  bytes: number;
  sha256: string;
  storageKey: string;
};
export function storageRoot() {
  return resolve(process.env.STORAGE_ROOT ?? resolve(__dirname, "../../../../../.local/storage"));
}
export async function scanFile(path: string) {
  // Fail closed if signatures are absent/stale or the daemon is unavailable.
  const signature = process.env.CLAMAV_SIGNATURE_FILE;
  if (!signature) throw new Error("SCANNER_UNAVAILABLE");
  const updated = (await stat(signature)).mtimeMs;
  if (Date.now() - updated > 48 * 3600000 || updated > Date.now() + 300000)
    throw new Error("SCANNER_SIGNATURES_STALE");
  return new Promise<"clean" | "infected">((done, reject) => {
    const socket = process.env.CLAMD_SOCKET
      ? createConnection(process.env.CLAMD_SOCKET)
      : createConnection({ host: "127.0.0.1", port: Number(process.env.CLAMD_PORT ?? 3310) });
    let reply = "",
      settled = false;
    const finish = (error?: Error, result?: "clean" | "infected") => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error);
      else done(result!);
    };
    const timeout = setTimeout(() => finish(new Error("SCANNER_TIMEOUT")), 60000);
    socket.on("close", () => {
      clearTimeout(timeout);
      if (!settled) finish(new Error("SCANNER_UNAVAILABLE"));
    });
    socket.on("error", () => finish(new Error("SCANNER_UNAVAILABLE")));
    socket.on("data", (data) => {
      reply += data.toString();
      if (reply.length > 4096) return finish(new Error("SCANNER_PROTOCOL"));
      if (reply.includes("\0")) {
        const value = reply.split("\0")[0];
        if (value === "stream: OK") finish(undefined, "clean");
        else if (/^stream: .+ FOUND$/.test(value)) finish(undefined, "infected");
        else finish(new Error("SCANNER_REJECTED"));
      }
    });
    const send = (data: Buffer) =>
      new Promise<void>((res, rej) => socket.write(data, (error) => (error ? rej(error) : res())));
    socket.on("connect", () => {
      void (async () => {
        await send(Buffer.from("zINSTREAM\0"));
        for await (const chunk of createReadStream(path, { highWaterMark: 65536 })) {
          if (settled) break;
          const length = Buffer.alloc(4);
          length.writeUInt32BE(chunk.length);
          await send(length);
          await send(chunk);
        }
        if (!settled) await send(Buffer.alloc(4));
      })().catch(() => finish(new Error("SCANNER_UNAVAILABLE")));
    });
  });
}
@Injectable()
export class FilesService {
  constructor(private readonly business: BusinessService) {}
  async initialize() {
    const root = storageRoot();
    for (const name of ["incoming", "quarantine", "available"])
      await mkdir(join(root, name), { recursive: true, mode: 0o700 });
    return root;
  }
  path(key: string, state: string) {
    if (!/^[a-f0-9-]{36}$/.test(key)) throw new Error("INVALID_STORAGE_KEY");
    return join(storageRoot(), state === "available" ? "available" : "quarantine", key);
  }
  async versions(actor: string, id: string) {
    await this.business.detail(actor, "document", id);
    return this.business.database.client.documentVersion.findMany({
      where: { documentId: id },
      select: {
        id: true,
        number: true,
        filename: true,
        mime: true,
        bytes: true,
        sha256: true,
        state: true,
        scanError: true,
        createdAt: true,
        uploadedById: true,
        note: true,
      },
      orderBy: { number: "desc" },
    });
  }
  async upload(actor: string, id: string, r: PortalRequest) {
    const resource = await this.business.policy(actor, id, "edit");
    if (resource.kind !== "document") throw new NotFoundException();
    const note = this.decodeHeader(r, "x-version-note", 500);
    return this.receive(r, async (tx, file) => {
      await tx.$queryRaw`SELECT id FROM resources WHERE id=${id}::uuid FOR UPDATE`;
      await this.business.policy(actor, id, "edit", tx);
      const result = await this.persist(tx, actor, id, file, note);
      await this.business.recordChange(tx, id, actor, "version_uploaded", r.requestId);
      return result;
    });
  }
  decodeHeader(r: PortalRequest, name: string, max: number) {
    let text: string;
    try {
      text = decodeURIComponent(String(r.headers[name] ?? ""));
    } catch {
      throw new BadRequestException();
    }
    if (
      text.length > max ||
      [...text].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
    )
      throw new BadRequestException();
    return text;
  }
  async persist(tx: Transaction, actor: string, id: string, file: ReceivedFile, note = "") {
    const last = await tx.documentVersion.aggregate({
      where: { documentId: id },
      _max: { number: true },
    });
    const row = await tx.documentVersion.create({
      data: {
        documentId: id,
        number: (last._max.number ?? 0) + 1,
        ...file,
        uploadedById: actor,
        note,
      },
    });
    await tx.outboxJob.create({
      data: { key: "scan:" + row.id, kind: "scan", resourceId: id, payload: { versionId: row.id } },
    });
    return { id: row.id, state: row.state, number: row.number };
  }
  async receive<T>(
    r: PortalRequest,
    save: (tx: Transaction, file: ReceivedFile) => Promise<T>,
  ): Promise<T> {
    if (r.headers["content-type"] !== "application/octet-stream") throw new BadRequestException();
    let filename = "";
    try {
      filename = decodeURIComponent(String(r.headers["x-file-name"] ?? ""));
    } catch {
      throw new BadRequestException();
    }
    if (
      !filename ||
      filename.length > 200 ||
      [...filename].some(
        (char) =>
          char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 || char === "/" || char === "\\",
      )
    )
      throw new BadRequestException();
    const claimed = String(r.headers["x-file-type"] ?? "");
    if (Number(r.headers["content-length"]) > MAX_UPLOAD) throw new PayloadTooLargeException();
    const root = await this.initialize(),
      space = await statfs(root);
    if (space.bavail * space.bsize < 512 * 1024 * 1024 + MAX_UPLOAD)
      throw new ServiceUnavailableException();
    const key = randomUUID(),
      incoming = join(root, "incoming", key),
      quarantine = this.path(key, "quarantined"),
      hash = createHash("sha256");
    let bytes = 0,
      committed = false;
    const limit = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        bytes += chunk.length;
        if (bytes > MAX_UPLOAD) return callback(new PayloadTooLargeException());
        hash.update(chunk);
        callback(null, chunk);
      },
    });
    const timeout = setTimeout(() => limit.destroy(new Error("UPLOAD_TIMEOUT")), 60000);
    try {
      await pipeline(
        r,
        limit,
        createWriteStream(incoming, { flags: "wx", mode: 0o600, flush: true }),
      );
      const mime = fileType(await readFile(incoming), filename);
      if (!bytes || (claimed && claimed !== "application/octet-stream" && claimed !== mime))
        throw new BadRequestException();
      const sha256 = hash.digest("hex");
      await rename(incoming, quarantine);
      const result = await this.business.database.client.$transaction(
        (tx) => save(tx, { filename, mime, bytes, sha256, storageKey: key }),
        { timeout: 20000 },
      );
      committed = true;
      return result;
    } finally {
      clearTimeout(timeout);
      if (!committed) {
        await unlink(incoming).catch(() => {});
        await unlink(quarantine).catch(() => {});
      }
    }
  }
  async process(versionId: string) {
    const db = this.business.database.client,
      row = await db.documentVersion.findUnique({ where: { id: versionId } });
    if (!row || row.state === "available" || row.state === "rejected") return;
    let source = this.path(row.storageKey, "quarantined");
    try {
      await stat(source);
    } catch {
      source = this.path(row.storageKey, "available");
    }
    try {
      const hash = createHash("sha256");
      let size = 0;
      for await (const chunk of createReadStream(source)) {
        hash.update(chunk);
        size += chunk.length;
      }
      if (size !== row.bytes || hash.digest("hex") !== row.sha256)
        throw new Error("FILE_CHECKSUM_MISMATCH");
      const result = await scanFile(source);
      if (result === "clean" && source !== this.path(row.storageKey, "available"))
        await rename(source, this.path(row.storageKey, "available"));
      await db.documentVersion.update({
        where: { id: versionId },
        data: {
          state: result === "clean" ? "available" : "rejected",
          scanError: result === "clean" ? null : "MALWARE_DETECTED",
        },
      });
    } catch (error) {
      const code =
        error instanceof Error && /^SCANNER_|^FILE_/.test(error.message)
          ? error.message
          : "SCANNER_UNAVAILABLE";
      await db.documentVersion.update({
        where: { id: versionId },
        data: { state: "scan_failed", scanError: code },
      });
      throw new Error(code, { cause: error });
    }
  }
  async retry(actor: string, id: string, requestId = "") {
    return this.business.database.client.$transaction(async (tx) => {
      const row = await tx.documentVersion.findUnique({ where: { id } });
      if (!row) throw new NotFoundException();
      await tx.$queryRaw`SELECT id FROM resources WHERE id=${row.documentId}::uuid FOR UPDATE`;
      await this.business.policy(actor, row.documentId, "edit", tx);
      if (!["quarantined", "scan_failed"].includes(row.state)) throw new ConflictException();
      const job = await tx.outboxJob.findUnique({ where: { key: "scan:" + id } });
      if (job?.status === "processing" && job.leaseUntil && job.leaseUntil > new Date())
        throw new ConflictException();
      await tx.documentVersion.update({
        where: { id },
        data: { state: "quarantined", scanError: null },
      });
      await tx.outboxJob.update({
        where: { key: "scan:" + id },
        data: {
          status: "pending",
          attempts: 0,
          availableAt: new Date(),
          leaseUntil: null,
          errorCode: null,
        },
      });
      await this.business.authorization.audit(
        tx,
        actor,
        "document.scan_retried",
        row.documentId,
        requestId || null,
        { versionId: id },
      );
      return { queued: true };
    });
  }
  async download(
    actor: string,
    id: string,
    response: Response,
    requestId: string,
    inline = false,
    range?: string,
  ) {
    const db = this.business.database.client,
      row = await db.documentVersion.findUnique({ where: { id } });
    if (!row) throw new NotFoundException();
    await this.business.policy(actor, row.documentId, "download");
    if (row.state !== "available") throw new ConflictException();
    const path = this.path(row.storageKey, "available");
    let size;
    try {
      size = (await stat(path)).size;
    } catch {
      throw new ServiceUnavailableException();
    }
    if (size !== row.bytes) throw new ServiceUnavailableException();
    await this.business.authorization.audit(
      db,
      actor,
      "document.download_authorized",
      row.documentId,
      requestId,
      { versionId: row.id },
    );
    if (
      inline &&
      ![
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/webp",
        "text/plain",
        "text/csv",
      ].includes(row.mime)
    )
      throw new BadRequestException();
    let start = 0,
      end = row.bytes - 1;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2])) {
        response.status(416).setHeader("Content-Range", `bytes */${row.bytes}`);
        response.end();
        return;
      }
      if (!match[1]) start = Math.max(0, row.bytes - Number(match[2]));
      else {
        start = Number(match[1]);
        if (match[2]) end = Math.min(end, Number(match[2]));
      }
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start > end ||
        start >= row.bytes
      ) {
        response.status(416).setHeader("Content-Range", `bytes */${row.bytes}`);
        response.end();
        return;
      }
      response.status(206);
      response.setHeader("Content-Range", `bytes ${start}-${end}/${row.bytes}`);
    }
    response.setHeader("Accept-Ranges", "bytes");
    response.setHeader("Content-Type", row.mime);
    response.setHeader("Content-Length", end - start + 1);
    response.setHeader(
      "Content-Disposition",
      `${inline ? "inline" : "attachment"}; filename="document-${row.number}"; filename*=UTF-8''${encodeURIComponent(row.filename).replace(/['()*]/g, (c) => "%" + c.charCodeAt(0).toString(16))}`,
    );
    response.setHeader("X-Content-Type-Options", "nosniff");
    if (inline)
      response.setHeader(
        "Content-Security-Policy",
        "sandbox; default-src 'none'; style-src 'unsafe-inline'",
      );
    await pipeline(createReadStream(path, { start, end }), response);
  }
}
