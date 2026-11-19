import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer, type AddressInfo } from "node:net";
import { mkdtemp, writeFile, readdir, rm, stat, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32 } from "node:zlib";
import { watch } from "node:fs";
import { request as httpRequest, type ClientRequest } from "node:http";
import { createDatabase } from "@lapnet/database";
import {
  workspaceDocumentDetailSchema,
  workspaceDocumentPageSchema,
  documentWorkspaceConfigSchema,
  taskDocumentsSchema,
  commentsSchema,
} from "@lapnet/contracts";
import { createApplication } from "../src/app";
import { hashPassword, randomSecret } from "../src/identity/password";
import { FilesService, MAX_UPLOAD } from "../src/business/files.service";
import { fileType } from "../src/business/file-types";

function zip(entries: Record<string, string>) {
  const chunks: Buffer[] = [],
    directory: Buffer[] = [];
  let offset = 0;
  for (const [name, value] of Object.entries(entries)) {
    const n = Buffer.from(name),
      b = Buffer.from(value),
      local = Buffer.alloc(30),
      central = Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc32(b), 14);
    local.writeUInt32LE(b.length, 18);
    local.writeUInt32LE(b.length, 22);
    local.writeUInt16LE(n.length, 26);
    chunks.push(local, n, b);
    central.writeUInt32LE(0x02014b50);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc32(b), 16);
    central.writeUInt32LE(b.length, 20);
    central.writeUInt32LE(b.length, 24);
    central.writeUInt16LE(n.length, 28);
    central.writeUInt32LE(offset, 42);
    directory.push(central, n);
    offset += local.length + n.length + b.length;
  }
  const dir = Buffer.concat(directory),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(directory.length / 2, 8);
  end.writeUInt16LE(directory.length / 2, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, dir, end]);
}
test("Document content validation", () => {
  assert.equal(fileType(Buffer.from("ສະບາຍດີ"), "hello.txt"), "text/plain");
  assert.equal(fileType(Buffer.from("%PDF-1.4\n%%EOF"), "sample.pdf"), "application/pdf");
  assert.throws(() => fileType(Buffer.from("<html>executable disguised as PDF</html>"), "bad.pdf"));
  assert.throws(() => fileType(Buffer.from([0, 255, 0]), "binary.txt"));
  assert.throws(() => fileType(Buffer.from("abc"), "file.exe"));
  const docx = zip({ "[Content_Types].xml": "<Types/>", "word/document.xml": "<document/>" });
  assert.equal(
    fileType(docx, "contract.docx"),
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  );
  assert.throws(() => fileType(docx, "budget.xlsx"));
  assert.throws(() => fileType(zip({ "../secret": "data" }), "archive.zip"));
  assert.throws(() =>
    fileType(
      zip({
        "[Content_Types].xml": "<Types/>",
        "word/document.xml": "<document/>",
        "word/vbaProject.bin": "macro",
      }),
      "contract.docx",
    ),
  );
  assert.throws(() => fileType(docx.subarray(0, docx.length - 1), "contract.docx"));
});

test(
  "Persistent document workspace, files and authorization",
  { skip: !process.env.TEST_IDENTITY_DATABASE_URL },
  async (t) => {
    const connection = process.env.TEST_IDENTITY_DATABASE_URL!,
      url = new URL(connection);
    assert(
      url.hostname === "127.0.0.1" &&
        url.port === "55432" &&
        /^\/lapnet_identity_[a-f0-9]+$/.test(url.pathname),
    );
    process.env.DATABASE_URL = connection;
    process.env.APP_ORIGIN = "http://127.0.0.1:5173";
    const storage = await mkdtemp(join(tmpdir(), "lapnet-documents-"));
    process.env.STORAGE_ROOT = storage;
    const signature = join(storage, "test-signatures.cvd");
    await writeFile(signature, "Test transport fixture, not a production signature database");
    process.env.CLAMAV_SIGNATURE_FILE = signature;
    delete process.env.CLAMD_SOCKET;
    // Exercise the INSTREAM transport with a deterministic test daemon. Production
    // still requires a real, fresh ClamAV signature database and daemon.
    const scanner = createServer((socket) => {
      let buffer = Buffer.alloc(0),
        started = false;
      const parts: Buffer[] = [];
      socket.on("data", (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        if (!started) {
          if (buffer.length < 10) return;
          assert.equal(buffer.subarray(0, 10).toString(), "zINSTREAM\0");
          buffer = buffer.subarray(10);
          started = true;
        }
        while (buffer.length >= 4) {
          const size = buffer.readUInt32BE(0);
          if (buffer.length < 4 + size) return;
          buffer = buffer.subarray(4);
          if (size === 0) {
            socket.end(
              Buffer.from(
                Buffer.concat(parts).includes(Buffer.from("EICAR"))
                  ? "stream: Eicar-Test-Signature FOUND\0"
                  : "stream: OK\0",
              ),
            );
            return;
          }
          parts.push(buffer.subarray(0, size));
          buffer = buffer.subarray(size);
        }
      });
    });
    await new Promise<void>((resolve) => scanner.listen(0, "127.0.0.1", resolve));
    process.env.CLAMD_PORT = String((scanner.address() as AddressInfo).port);
    const db = createDatabase(connection),
      password = randomSecret().slice(0, 24),
      passwordHash = await hashPassword(password);
    const users = await Promise.all(
      ["doc_owner", "doc_colleague", "doc_outsider", "doc_admin"].map((username) =>
        db.user.create({
          data: {
            username,
            identitySubject: username,
            displayName: username,
            passwordHash,
            mustChangePassword: false,
          },
        }),
      ),
    );
    const [owner, colleague, outsider, admin] = users,
      deps = await db.department.findMany(),
      finance = deps.find((d) => d.code === "FINANCE")!.id,
      it = deps.find((d) => d.code === "IT")!.id;
    await db.departmentMembership.createMany({
      data: [
        { userId: owner.id, departmentId: finance },
        { userId: colleague.id, departmentId: finance },
        { userId: outsider.id, departmentId: it },
      ],
    });
    await db.roleAssignment.create({
      data: { userId: admin.id, role: "portal_admin", grantedById: admin.id },
    });
    let app = await createApplication(undefined, false);
    await app.listen(0, "127.0.0.1");
    let origin = "http://127.0.0.1:" + (app.getHttpServer().address() as AddressInfo).port;
    type Client = { cookie: string; csrf: string };
    async function request(
      c: Client,
      path: string,
      method = "GET",
      body?: unknown,
      extra: Record<string, string> = {},
      csrf = true,
    ) {
      const response = await fetch(origin + path, {
        method,
        headers: {
          origin: process.env.APP_ORIGIN!,
          ...(c.cookie ? { cookie: c.cookie } : {}),
          ...(csrf && c.csrf ? { "x-csrf-token": c.csrf } : {}),
          ...(body !== undefined && !Buffer.isBuffer(body)
            ? { "content-type": "application/json" }
            : {}),
          ...extra,
        },
        ...(body !== undefined
          ? { body: Buffer.isBuffer(body) ? Uint8Array.from(body).buffer : JSON.stringify(body) }
          : {}),
      });
      const cookie = response.headers.get("set-cookie");
      if (cookie) c.cookie = cookie.split(";")[0];
      const value = response.headers.get("content-type")?.includes("application/json")
        ? await response.json()
        : await response.text();
      if (value?.csrfToken) c.csrf = value.csrfToken;
      return { status: response.status, value, headers: response.headers };
    }
    async function login(username: string) {
      const c = { cookie: "", csrf: "" };
      assert.equal((await request(c, "/auth/login", "POST", { username, password })).status, 201);
      return c;
    }
    const oc = await login(owner.username!),
      cc = await login(colleague.username!),
      xc = await login(outsider.username!),
      ac = await login(admin.username!),
      anonymous = { cookie: "", csrf: "" };
    const base = "/api/v1/document-workspace";
    let folder = "",
      child = "",
      id = "",
      firstVersion = "";
    const metadata = (patch: Record<string, unknown> = {}) => ({
      title: "ສັນຍາທົດສອບ",
      departmentId: finance,
      folderId: folder,
      registryNumber: "REG-QA-01",
      companyId: null,
      data: {
        direction: "incoming",
        issueDate: "2026-11-17",
        externalNumber: "EXT-QA",
        description: "Test record",
        tags: ["Audit"],
      },
      movement: {
        occurredOn: "2026-11-17",
        counterpartyName: "Test partner",
        reference: "IN-1",
        note: "Original received",
      },
      ...patch,
    });
    const upload = (
      c: Client,
      path: string,
      content: Buffer,
      name: string,
      meta?: unknown,
      csrf = true,
    ) =>
      request(
        c,
        path,
        "POST",
        content,
        {
          "content-type": "application/octet-stream",
          "x-file-name": encodeURIComponent(name),
          "x-file-type": "application/octet-stream",
          ...(meta ? { "x-document-metadata": encodeURIComponent(JSON.stringify(meta)) } : {}),
        },
        csrf,
      );
    try {
      await t.test("Session, CSRF and writable department are required", async () => {
        assert.equal((await request(anonymous, base + "/config")).status, 401);
        assert.equal(
          (
            await request(
              oc,
              base + "/folders",
              "POST",
              { name: "Finance docs", departmentId: finance },
              {},
              false,
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await request(ac, base + "/folders", "POST", {
              name: "Finance docs",
              departmentId: finance,
            })
          ).status,
          403,
        );
        assert.equal(
          (
            await request(xc, base + "/folders", "POST", {
              name: "Finance docs",
              departmentId: finance,
            })
          ).status,
          403,
        );
        documentWorkspaceConfigSchema.parse((await request(oc, base + "/config")).value);
      });
      await t.test(
        "Folder persistence, case-insensitive duplicates, stale revisions and cycles",
        async () => {
          let r = await request(oc, base + "/folders", "POST", {
            name: "Finance docs",
            departmentId: finance,
          });
          assert.equal(r.status, 201);
          folder = r.value.id;
          assert.equal(
            (
              await request(oc, base + "/folders", "POST", {
                name: "finance DOCS",
                departmentId: finance,
              })
            ).status,
            409,
          );
          r = await request(oc, base + "/folders", "POST", {
            name: "Incoming",
            departmentId: finance,
            parentId: folder,
          });
          assert.equal(r.status, 201);
          child = r.value.id;
          assert.equal(
            (
              await request(oc, base + "/folders/" + folder, "PATCH", {
                parentId: child,
                revision: 1,
              })
            ).status,
            409,
          );
          assert.equal(
            (
              await request(cc, base + "/folders/" + folder, "PATCH", {
                name: "Hijacked",
                revision: 1,
              })
            ).status,
            403,
          );
          assert.equal(
            (
              await request(oc, base + "/folders/" + child, "PATCH", {
                name: "Incoming documents",
                revision: 1,
              })
            ).status,
            200,
          );
          assert.equal(
            (await request(oc, base + "/folders/" + child, "PATCH", { name: "Stale", revision: 1 }))
              .status,
            409,
          );
          assert.equal((await request(xc, base + "/folders")).value.length, 0);
        },
      );
      await t.test(
        "Invalid registration rolls back file, resource, metadata and queue",
        async () => {
          const before = await db.resource.count();
          assert.equal(
            (await upload(oc, base + "/register", Buffer.from("not a PDF"), "fake.pdf", metadata()))
              .status,
            400,
          );
          assert.equal(
            (
              await upload(
                oc,
                base + "/register",
                Buffer.from("valid"),
                "file.txt",
                metadata({
                  data: { direction: "internal", issueDate: "2026-11-17" },
                  movement: { occurredOn: "2026-11-17", counterpartyName: "Bad" },
                }),
              )
            ).status,
            400,
          );
          assert.equal(
            (
              await upload(
                oc,
                base + "/register",
                Buffer.from("valid"),
                "file.txt",
                metadata({ ownerUserId: outsider.id }),
              )
            ).status,
            400,
          );
          assert.equal(await db.resource.count(), before);
          assert.equal((await readdir(join(storage, "quarantine"))).length, 0);
        },
      );
      await t.test(
        "Atomic registration saves the real file, movement, history and scan job",
        async () => {
          const r = await upload(
            oc,
            base + "/register",
            Buffer.from("Signed contract — ສັນຍາ"),
            "contract.txt",
            metadata(),
          );
          assert.equal(r.status, 201);
          id = r.value.id;
          firstVersion = r.value.version.id;
          const detail = workspaceDocumentDetailSchema.parse(
            (await request(oc, base + "/documents/" + id)).value,
          );
          assert.equal(detail.registryNumber, "REG-QA-01");
          assert.equal(detail.folderId, folder);
          assert.equal(detail.movements[0].counterpartyName, "Test partner");
          assert.equal(detail.versions[0].state, "quarantined");
          assert.equal(detail.versions[0].uploadedById, owner.id);
          assert.equal(detail.history.length, 1);
          assert.equal(detail.history[0].action, "registered");
          assert(!JSON.stringify(detail).includes("storageKey"));
          assert.equal(await db.outboxJob.count({ where: { resourceId: id, kind: "scan" } }), 1);
          assert.equal(
            (await request(oc, "/api/v1/document-versions/" + firstVersion + "/download")).status,
            409,
          );
          const count = await db.resource.count();
          assert.equal(
            (
              await upload(
                oc,
                base + "/register",
                Buffer.from("duplicate"),
                "duplicate.txt",
                metadata(),
              )
            ).status,
            409,
          );
          assert.equal(await db.resource.count(), count);
          assert.equal((await readdir(join(storage, "quarantine"))).length, 1);
        },
      );
      await t.test(
        "Read ACL filters rows, counts, search and folders; membership/admin do not grant document access",
        async () => {
          for (const c of [cc, xc, ac]) {
            assert.equal((await request(c, base + "/documents/" + id)).status, 404);
            const r = workspaceDocumentPageSchema.parse(
              (await request(c, base + "/documents?q=EXT-QA")).value,
            );
            assert.equal(r.total, 0);
            assert.equal(r.items.length, 0);
          }
          const mine = workspaceDocumentPageSchema.parse(
            (await request(oc, base + "/documents?folderId=" + folder)).value,
          );
          assert.equal(mine.total, 1);
          assert.equal(mine.items[0].id, id);
          assert.equal(mine.items[0].movements.length, 1);
          assert.equal(mine.items[0].movements[0].direction, "incoming");
        },
      );
      await t.test(
        "task document activity respects both resources and identifies contributors",
        async () => {
          const record = workspaceDocumentPageSchema
            .parse((await request(oc, base + "/documents")).value)
            .items.find((document) => document.id === id)!;
          for (const term of [
            record.title,
            record.code,
            "REG-QA-01",
            record.versions[0].filename,
          ]) {
            const found = workspaceDocumentPageSchema.parse(
              (await request(oc, base + "/documents?q=" + encodeURIComponent(term))).value,
            );
            assert(
              found.items.some((document) => document.id === id),
              `Document lookup: ${term}`,
            );
            const denied = workspaceDocumentPageSchema.parse(
              (await request(cc, base + "/documents?q=" + encodeURIComponent(term))).value,
            );
            assert.equal(denied.total, 0);
          }
          assert.equal(
            (await request(oc, base + "/documents?q=REG-999999999999999999999")).status,
            200,
          );
          const task = await request(oc, "/api/v1/tasks", "POST", {
            title: "Review document",
            description: "",
            priority: "normal",
            departmentId: finance,
            assigneeId: owner.id,
            collaboratorIds: [colleague.id],
            shareParticipants: true,
          });
          assert.equal(task.status, 201);
          const taskPath = "/api/v1/tasks/" + task.value.id;
          const resourcePath = "/api/v1/resources/" + task.value.id;
          assert.equal(
            (
              await request(oc, resourcePath + "/links", "POST", {
                targetId: id,
                kind: "attachment",
              })
            ).status,
            201,
          );
          const timeline = taskDocumentsSchema.parse(
            (await request(oc, taskPath + "/documents")).value,
          );
          assert.equal(timeline.items[0].id, id);
          assert.equal(timeline.items[0].href, "/document-workspace/" + id);
          assert.equal(timeline.items[0].latestVersion, 1);
          assert.equal(
            timeline.activity.find((event) => event.kind === "linked")?.actorName,
            owner.displayName,
          );
          assert.equal(
            timeline.activity.find((event) => event.kind === "version")?.actorName,
            owner.displayName,
          );
          assert.deepEqual((await request(cc, taskPath + "/documents")).value, {
            items: [],
            activity: [],
          });
          assert.equal((await request(xc, taskPath + "/documents")).status, 404);
          assert.equal((await request(cc, taskPath)).value.permissions.comment, true);
          assert.equal(
            (
              await request(cc, resourcePath + "/comments", "POST", {
                text: "Reviewed",
                mentions: [],
              })
            ).status,
            201,
          );
          const comments = commentsSchema.parse(
            (await request(oc, resourcePath + "/comments")).value,
          );
          assert.equal(comments.items[0].author.displayName, colleague.displayName);
          assert.deepEqual(comments.items[0].author.departments, ["Finance"]);
          assert.equal(
            (
              await request(oc, resourcePath + "/grants", "POST", {
                userId: outsider.id,
                permission: "view",
              })
            ).status,
            201,
          );
          assert.equal(
            (
              await request(xc, resourcePath + "/comments", "POST", {
                text: "View only",
                mentions: [],
              })
            ).status,
            403,
          );
        },
      );
      await t.test(
        "Actual scan transport releases clean files; authenticated preview supports ranges",
        async () => {
          await app.get(FilesService).process(firstVersion);
          const download = await request(
            oc,
            "/api/v1/document-versions/" + firstVersion + "/download",
          );
          assert.equal(download.status, 200);
          assert.equal(download.value, "Signed contract — ສັນຍາ");
          assert.match(download.headers.get("content-disposition")!, /^attachment/);
          const preview = await request(
            oc,
            "/api/v1/document-versions/" + firstVersion + "/preview",
            "GET",
            undefined,
            { range: "bytes=0-5" },
          );
          assert.equal(preview.status, 206);
          assert.equal(preview.value, "Signed");
          assert.match(preview.headers.get("content-security-policy")!, /sandbox/);
          assert.equal(
            (await request(anonymous, "/api/v1/document-versions/" + firstVersion + "/preview"))
              .status,
            401,
          );
          assert.equal(
            (
              await request(
                oc,
                "/api/v1/document-versions/" + firstVersion + "/preview",
                "GET",
                undefined,
                { range: "bytes=999999-" },
              )
            ).status,
            416,
          );
        },
      );
      await t.test(
        "Grants are atomic, downloads are separate, revocation is immediate",
        async () => {
          assert.equal(
            (
              await request(oc, base + "/documents/" + id + "/grants", "POST", {
                userId: outsider.id,
                permission: "edit",
              })
            ).status,
            201,
          );
          const doc = workspaceDocumentDetailSchema.parse(
            (await request(xc, base + "/documents/" + id)).value,
          );
          assert(doc.permissions.edit);
          assert(!doc.permissions.download);
          const ownFolder = await request(xc, base + "/folders", "POST", {
            name: "Other department destination",
            departmentId: it,
          });
          assert.equal(ownFolder.status, 201);
          assert.equal(
            (
              await request(xc, `${base}/documents/${id}`, "PATCH", {
                revision: doc.revision,
                folderId: ownFolder.value.id,
              })
            ).status,
            400,
          );
          const unplaced = await request(xc, `${base}/documents/${id}`, "PATCH", {
            revision: doc.revision,
            folderId: null,
          });
          assert.equal(unplaced.status, 200);
          assert.equal(unplaced.value.folderId, null);
          assert.equal(
            (
              await request(oc, `${base}/documents/${id}`, "PATCH", {
                revision: unplaced.value.revision,
                folderId: folder,
              })
            ).status,
            200,
          );
          assert.equal(
            (await request(xc, "/api/v1/document-versions/" + firstVersion + "/download")).status,
            403,
          );
          assert.equal(
            (
              await request(xc, base + "/documents/" + id + "/grants", "POST", {
                userId: colleague.id,
                permission: "manage_access",
              })
            ).status,
            403,
          );
          assert.equal(
            (
              await request(oc, base + "/documents/" + id + "/grants", "POST", {
                userId: outsider.id,
                permission: "download",
              })
            ).status,
            201,
          );
          const beforeRepeat = await db.businessRevision.count({ where: { recordId: id } });
          const repeated = await Promise.all(
            [1, 2].map(() =>
              request(oc, base + "/documents/" + id + "/grants", "POST", {
                userId: outsider.id,
                permission: "download",
              }),
            ),
          );
          assert(repeated.every((result) => result.status === 201));
          assert.equal(await db.businessRevision.count({ where: { recordId: id } }), beforeRepeat);
          assert.equal(
            (await request(xc, "/api/v1/document-versions/" + firstVersion + "/download")).status,
            200,
          );
          const grants = await db.resourceGrant.findMany({
            where: { resourceId: id, userId: outsider.id, revokedAt: null },
          });
          assert.equal(grants.length, 3);
          assert.equal(
            (await request(xc, `${base}/documents/${id}/grants/${grants[0].id}`, "DELETE")).status,
            403,
          );
          for (const g of grants)
            assert.equal(
              (await request(oc, `${base}/documents/${id}/grants/${g.id}`, "DELETE")).status,
              200,
            );
          assert.equal(
            await db.businessRevision.count({ where: { recordId: id } }),
            beforeRepeat + grants.length,
          );
          const afterRevoke = workspaceDocumentDetailSchema.parse(
            (await request(oc, `${base}/documents/${id}`)).value,
          );
          assert.equal(afterRevoke.history[0].action, "access_revoked");
          assert.equal(
            (await request(oc, `${base}/documents/${id}/grants/${grants[0].id}`, "DELETE")).status,
            404,
          );
          assert.equal(
            (await request(xc, "/api/v1/document-versions/" + firstVersion + "/download")).status,
            404,
          );
        },
      );
      await t.test(
        "Concurrent metadata edits require revisions; dates and folder scope are validated",
        async () => {
          let current = (await request(oc, base + "/documents/" + id)).value;
          const revision = current.revision;
          const results = await Promise.all(
            ["One", "Two"].map((title) =>
              request(oc, base + "/documents/" + id, "PATCH", { revision, title }),
            ),
          );
          assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
          current = (await request(oc, base + "/documents/" + id)).value;
          assert.equal(
            (
              await request(oc, base + "/documents/" + id, "PATCH", {
                revision: current.revision,
                data: { ...current.data, issueDate: "2026-02-30" },
              })
            ).status,
            400,
          );
          assert.equal(
            (
              await request(oc, base + "/documents/" + id, "PATCH", {
                revision: current.revision,
                folderId: child,
              })
            ).status,
            200,
          );
          assert.equal(
            (
              await request(oc, "/api/v1/documents/" + id + "/movements", "POST", {
                direction: "outgoing",
                occurredOn: "2026-11-16",
                counterpartyName: "Too early",
              })
            ).status,
            400,
          );
          assert.equal(
            (
              await request(oc, "/api/v1/documents/" + id + "/movements", "POST", {
                direction: "outgoing",
                occurredOn: "2026-11-18",
                counterpartyName: "Client",
                reference: "OUT-2",
                note: "Sent original",
              })
            ).status,
            201,
          );
        },
      );
      await t.test(
        "New versions preserve available predecessors; malware, unavailable scanner and stale signatures fail closed",
        async () => {
          const uploadResult = await upload(
            oc,
            `/api/v1/documents/${id}/versions`,
            Buffer.from("EICAR transport fixture"),
            "unsafe.txt",
          );
          assert.equal(uploadResult.status, 201);
          const versionId = uploadResult.value.id;
          await app.get(FilesService).process(versionId);
          assert.equal(
            (await request(oc, "/api/v1/document-versions/" + versionId + "/download")).status,
            409,
          );
          assert.equal(
            (await db.documentVersion.findUniqueOrThrow({ where: { id: versionId } })).state,
            "rejected",
          );
          const failed = await upload(
            oc,
            `/api/v1/documents/${id}/versions`,
            Buffer.from("New clean version"),
            "new.txt",
          );
          const failedId = failed.value.id;
          await utimes(signature, new Date(0), new Date(0));
          await assert.rejects(app.get(FilesService).process(failedId), /SCANNER_SIGNATURES_STALE/);
          assert.equal(
            (await db.documentVersion.findUniqueOrThrow({ where: { id: failedId } })).state,
            "scan_failed",
          );
          await utimes(signature, new Date(), new Date());
          process.env.CLAMD_SOCKET = join(storage, "missing-scanner.sock");
          await assert.rejects(app.get(FilesService).process(failedId), /SCANNER_UNAVAILABLE/);
          assert.equal(
            (await db.documentVersion.findUniqueOrThrow({ where: { id: failedId } })).state,
            "scan_failed",
          );
          delete process.env.CLAMD_SOCKET;
          assert.equal(
            (await request(oc, "/api/v1/document-versions/" + failedId + "/retry", "POST", {}))
              .status,
            201,
          );
          await app.get(FilesService).process(failedId);
          assert.equal(
            (await db.documentVersion.findUniqueOrThrow({ where: { id: failedId } })).state,
            "available",
          );
          assert.equal(
            (await request(oc, "/api/v1/document-versions/" + firstVersion + "/download")).status,
            200,
          );
          assert.equal(
            (
              await upload(
                oc,
                `/api/v1/documents/${id}/versions`,
                Buffer.alloc(MAX_UPLOAD + 1),
                "too-large.txt",
              )
            ).status,
            413,
          );
        },
      );
      await t.test(
        "Persistence survives API restart; folder deletion requires the exact name",
        async () => {
          await app.close();
          app = await createApplication(undefined, false);
          await app.listen(0, "127.0.0.1");
          origin = "http://127.0.0.1:" + (app.getHttpServer().address() as AddressInfo).port;
          const saved = workspaceDocumentDetailSchema.parse(
            (await request(oc, base + "/documents/" + id)).value,
          );
          assert.equal(saved.folderId, child);
          assert.equal(saved.versions.length, 3);
          assert(saved.history.length >= 4);
          assert.equal(
            (
              await request(oc, base + "/folders/" + child, "DELETE", {
                revision: 2,
                confirmationName: "Wrong name",
              })
            ).status,
            400,
          );
          const fresh = await request(oc, base + "/folders", "POST", {
            name: "Temporary empty",
            departmentId: finance,
          });
          assert.equal(
            (
              await request(oc, base + "/folders/" + fresh.value.id, "DELETE", {
                revision: 1,
                confirmationName: "Temporary empty",
              })
            ).status,
            200,
          );
          assert(
            (
              await stat(
                join(
                  storage,
                  "available",
                  (await db.documentVersion.findUniqueOrThrow({ where: { id: firstVersion } }))
                    .storageKey,
                ),
              )
            ).size > 0,
          );
          await assert.rejects(db.businessRevision.deleteMany({ where: { recordId: id } }));
        },
      );
      await t.test(
        "Task viewers upload scoped documents with atomic history and inherited access",
        async () => {
          const task = await request(oc, "/api/v1/tasks", "POST", {
            title: "Open task uploads",
            description: "",
            priority: "normal",
            dueDate: null,
            departmentId: finance,
            assigneeId: owner.id,
            collaboratorIds: [colleague.id],
          });
          assert.equal(task.status, 201);
          const taskId = task.value.id,
            path = `/api/v1/tasks/${taskId}/documents`;
          await request(oc, `/api/v1/resources/${taskId}/grants`, "POST", {
            userId: outsider.id,
            permission: "view",
          });
          assert.equal(
            (await upload(anonymous, path, Buffer.from("file"), "anonymous.txt")).status,
            401,
          );
          assert.equal(
            (await upload(cc, path, Buffer.from("file"), "csrf.txt", undefined, false)).status,
            403,
          );
          assert.equal((await upload(ac, path, Buffer.from("file"), "admin.txt")).status, 404);
          const before = await db.resource.count();
          assert.equal((await upload(cc, path, Buffer.from("invalid PDF"), "bad.pdf")).status, 400);
          assert.equal(await db.resource.count(), before);
          const posted = await upload(
            xc,
            path,
            Buffer.from("Task-scoped document bytes"),
            "team-upload.txt",
          );
          assert.equal(posted.status, 201);
          const documentId = posted.value.id,
            versionId = posted.value.version.id;
          const row = await db.businessRecord.findUniqueOrThrow({ where: { id: documentId } });
          assert.equal(row.parentId, taskId);
          assert.equal(row.revision, 1);
          assert.equal(await db.businessRevision.count({ where: { recordId: documentId } }), 1);
          const timeline = taskDocumentsSchema.parse((await request(oc, path)).value);
          assert.equal(timeline.items[0].id, documentId);
          assert.equal(timeline.activity.length, 1);
          assert.equal(timeline.activity[0].actorName, outsider.displayName);
          assert.equal(timeline.activity[0].filename, "team-upload.txt");
          assert.equal(timeline.activity[0].state, "quarantined");
          assert.equal(timeline.activity[0].documentId, documentId);
          for (const client of [oc, cc, xc]) {
            const library = workspaceDocumentPageSchema.parse(
              (await request(client, base + "/documents?q=team-upload")).value,
            );
            assert.equal(library.items[0].id, documentId);
            assert.equal(library.items[0].permissions.download, true);
            assert.equal(library.items[0].permissions.manageAccess, false);
          }
          assert.equal((await request(ac, base + "/documents/" + documentId)).status, 404);
          assert.equal(
            (await request(ac, `/api/v1/document-versions/${versionId}/download`)).status,
            404,
          );
          await app.get(FilesService).process(versionId);
          const downloaded = await request(cc, `/api/v1/document-versions/${versionId}/download`);
          assert.equal(downloaded.status, 200);
          assert.equal(downloaded.value, "Task-scoped document bytes");
          const newViewer = await request(oc, `/api/v1/resources/${taskId}/grants`, "POST", {
            userId: admin.id,
            permission: "view",
          });
          assert.equal((await request(ac, base + "/documents/" + documentId)).status, 200);
          await request(oc, `/api/v1/resources/${taskId}/grants/${newViewer.value.id}`, "DELETE");
          assert.equal((await request(ac, base + "/documents/" + documentId)).status, 404);
          assert.equal(
            (
              await upload(
                cc,
                `/api/v1/documents/${documentId}/versions`,
                Buffer.from("Team second version"),
                "team-update.txt",
              )
            ).status,
            201,
          );
          const updated = taskDocumentsSchema.parse((await request(oc, path)).value);
          assert.equal(updated.activity[0].actorName, colleague.displayName);
          assert.equal(updated.activity[0].version, 2);
          assert.equal(
            (
              await request(xc, base + `/documents/${documentId}/grants`, "POST", {
                userId: admin.id,
                permission: "view",
              })
            ).status,
            403,
          );
          const grants = (await request(oc, `/api/v1/resources/${taskId}/grants`)).value;
          const view = grants.find(
            (grant: { userId: string; permission: string }) =>
              grant.userId === outsider.id && grant.permission === "view",
          );
          await request(oc, `/api/v1/resources/${taskId}/grants/${view.id}`, "DELETE");
          assert.equal((await request(xc, base + "/documents/" + documentId)).status, 404);
          assert.equal(
            (await request(xc, `/api/v1/document-versions/${versionId}/download`)).status,
            404,
          );
          assert.equal(
            workspaceDocumentPageSchema.parse(
              (await request(xc, base + "/documents?q=team-upload")).value,
            ).total,
            0,
          );
          assert.equal(
            (await upload(xc, path, Buffer.from("Revoked upload"), "revoked.txt")).status,
            404,
          );
          const temporary = await request(oc, `/api/v1/resources/${taskId}/grants`, "POST", {
            userId: outsider.id,
            permission: "view",
          });
          const count = await db.resource.count(),
            incoming = await readdir(join(storage, "incoming")),
            quarantined = await readdir(join(storage, "quarantine"));
          let stream!: ClientRequest;
          const started = new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
              observer.close();
              reject(new Error("Upload did not start"));
            }, 5000);
            const observer = watch(join(storage, "incoming"), () => {
              clearTimeout(timeout);
              observer.close();
              resolve();
            });
          });
          const prefix = Buffer.from("Stream began while authorized\n"),
            tail = Buffer.from("Final bytes after revocation");
          const pendingUpload = new Promise<number>((resolve, reject) => {
            stream = httpRequest(
              origin + path,
              {
                method: "POST",
                headers: {
                  origin: process.env.APP_ORIGIN!,
                  cookie: xc.cookie,
                  "x-csrf-token": xc.csrf,
                  "content-type": "application/octet-stream",
                  "x-file-name": "racing-upload.txt",
                  "content-length": prefix.length + tail.length,
                },
              },
              (response) => {
                response.resume();
                response.on("end", () => resolve(response.statusCode!));
              },
            );
            stream.on("error", reject);
            stream.write(prefix);
          });
          await started;
          await request(oc, `/api/v1/resources/${taskId}/grants/${temporary.value.id}`, "DELETE");
          stream.end(tail);
          assert.equal(await pendingUpload, 404);
          assert.equal(await db.resource.count(), count);
          assert.deepEqual(await readdir(join(storage, "incoming")), incoming);
          assert.deepEqual(await readdir(join(storage, "quarantine")), quarantined);
          assert.equal(
            (
              await request(oc, `/api/v1/tasks/${taskId}/archive`, "POST", {
                revision: task.value.revision,
              })
            ).status,
            201,
          );
          assert.equal((await request(oc, base + "/documents/" + documentId)).status, 404);
        },
      );
      await t.test("PDF preview retains authenticated file boundaries", async () => {
        const result = await upload(
          oc,
          base + "/register",
          Buffer.from("%PDF-1.4\n%%EOF"),
          "preview.pdf",
          metadata({ registryNumber: "REG-PDF-QA", folderId: null }),
        );
        assert.equal(result.status, 201);
        const versionId = result.value.version.id;
        await app.get(FilesService).process(versionId);
        const preview = await request(oc, `/api/v1/document-versions/${versionId}/preview`);
        assert.equal(preview.status, 200);
        assert.equal(preview.headers.get("content-type"), "application/pdf");
        assert.match(preview.headers.get("content-security-policy")!, /sandbox/);
        assert.equal(preview.headers.get("x-content-type-options"), "nosniff");
        assert.equal(
          (await request(anonymous, `/api/v1/document-versions/${versionId}/preview`)).status,
          401,
        );
        assert.equal(
          (await request(xc, `/api/v1/document-versions/${versionId}/preview`)).status,
          404,
        );
      });
      await t.test(
        "Recursive folder deletion is name-confirmed, authorized and atomic",
        async () => {
          const childRow = await db.documentFolder.findUniqueOrThrow({ where: { id: child } });
          const revision = childRow.revision;
          assert.equal(
            (await request(oc, `${base}/folders/${child}`, "DELETE", { revision })).status,
            400,
          );
          assert.equal(
            (
              await request(oc, `${base}/folders/${child}`, "DELETE", {
                revision: revision + 1,
                confirmationName: childRow.name,
              })
            ).status,
            409,
          );
          assert.equal(
            (
              await request(cc, `${base}/folders/${child}`, "DELETE", {
                revision,
                confirmationName: childRow.name,
              })
            ).status,
            403,
          );
          const before = await db.businessRecord.findUniqueOrThrow({ where: { id } });
          // A folder may contain documents owned by another member without granting deletion rights.
          const foreign = await upload(
            cc,
            base + "/register",
            Buffer.from("Foreign document"),
            "foreign.txt",
            metadata({ registryNumber: "REG-FOREIGN", folderId: child }),
          );
          assert.equal(foreign.status, 201);
          assert.equal(
            (
              await request(oc, `${base}/folders/${child}`, "DELETE", {
                revision,
                confirmationName: childRow.name,
              })
            ).status,
            404,
          );
          assert.equal((await db.resource.findUniqueOrThrow({ where: { id } })).archivedAt, null);
          assert.equal(
            (await db.businessRecord.findUniqueOrThrow({ where: { id } })).revision,
            before.revision,
          );
          const foreignDetail = (await request(cc, `${base}/documents/${foreign.value.id}`)).value;
          assert.equal(
            (
              await request(cc, `${base}/documents/${foreign.value.id}`, "PATCH", {
                revision: foreignDetail.revision,
                folderId: null,
              })
            ).status,
            200,
          );
          const rootRow = await db.documentFolder.findUniqueOrThrow({ where: { id: folder } });
          assert.equal(
            (
              await request(oc, `${base}/folders/${folder}`, "DELETE", {
                revision: rootRow.revision,
                confirmationName: rootRow.name,
              })
            ).status,
            200,
          );
          assert.equal(
            await db.documentFolder.count({ where: { id: { in: [folder, child] } } }),
            0,
          );
          assert((await db.resource.findUniqueOrThrow({ where: { id } })).archivedAt);
          assert.equal(
            (await db.documentMetadata.findUniqueOrThrow({ where: { documentId: id } })).folderId,
            null,
          );
          assert.equal((await request(oc, `${base}/documents/${id}`)).status, 404);
          assert.equal(
            (await request(oc, `/api/v1/document-versions/${firstVersion}/download`)).status,
            404,
          );
          assert.equal(
            (await request(oc, base + "/documents")).value.items.some(
              (row: { id: string }) => row.id === id,
            ),
            false,
          );
          assert((await db.businessRevision.count({ where: { recordId: id } })) > 0);
        },
      );
    } finally {
      await app.close();
      await db.$disconnect();
      await new Promise<void>((resolve) => scanner.close(() => resolve()));
      await rm(storage, { recursive: true, force: true });
    }
  },
);
