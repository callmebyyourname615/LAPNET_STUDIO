import {
  BadRequestException,
  HttpException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnauthorizedException,
} from "@nestjs/common";
import type { Response } from "express";
import sharp from "sharp";
import { DatabaseService } from "../database.service";
import { AuthorizationService } from "./authorization.service";
import type { PortalRequest } from "../http";
import { accountImageLimits } from "@lapnet/contracts";

export type UserImageKind = "avatar" | "cover";
export const MAX_USER_IMAGE_BYTES = accountImageLimits.maxBytes;
const maxStoredBytes = 4 * 1024 * 1024;
export function imageKind(value: string): UserImageKind {
  if (value !== "avatar" && value !== "cover") throw new BadRequestException();
  return value;
}
export function userImageUrl(kind: string, revision: number) {
  return `/api/v1/me/images/${kind}?v=${revision}`;
}

/** Decode and re-encode image pixels; raw uploads and their metadata are never served. */
export async function normalizeUserImage(input: Buffer, kind: UserImageKind) {
  if (!input.length) throw new BadRequestException();
  if (input.length > MAX_USER_IMAGE_BYTES) throw new PayloadTooLargeException();
  const png = input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = input[0] === 255 && input[1] === 216 && input[2] === 255;
  const webp =
    input.subarray(0, 4).toString() === "RIFF" && input.subarray(8, 12).toString() === "WEBP";
  if (!png && !jpeg && !webp) throw new BadRequestException();
  try {
    const image = sharp(input, { limitInputPixels: 20_000_000, failOn: "warning" });
    const metadata = await image.metadata();
    if (!["jpeg", "png", "webp"].includes(metadata.format ?? "") || (metadata.pages ?? 1) !== 1)
      throw new BadRequestException();
    const output = await image
      .rotate()
      .resize(
        kind === "avatar"
          ? { width: 512, height: 512, fit: "cover" }
          : { width: 2400, height: 1200, fit: "inside", withoutEnlargement: true },
      )
      .webp({ quality: 85, effort: 4 })
      .toBuffer();
    if (output.length > maxStoredBytes) throw new PayloadTooLargeException();
    return output;
  } catch (error) {
    if (error instanceof PayloadTooLargeException) throw error;
    throw new BadRequestException();
  }
}

@Injectable()
export class UserImagesService {
  private processing = 0;
  constructor(
    private readonly database: DatabaseService,
    private readonly authorization: AuthorizationService,
  ) {}
  async upload(r: PortalRequest, kind: UserImageKind) {
    if (r.headers["content-type"] !== "application/octet-stream") throw new BadRequestException();
    const length = Number(r.headers["content-length"]);
    if (length > MAX_USER_IMAGE_BYTES) throw new PayloadTooLargeException();
    if (this.processing >= 2) throw new HttpException("Image processing busy", 429);
    this.processing++;
    try {
      const chunks: Buffer[] = [];
      let bytes = 0;
      for await (const chunk of r.iterator({ destroyOnReturn: false })) {
        const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytes += part.length;
        if (bytes > MAX_USER_IMAGE_BYTES) {
          r.resume();
          throw new PayloadTooLargeException();
        }
        chunks.push(part);
      }
      const data = await normalizeUserImage(Buffer.concat(chunks), kind),
        principal = r.principal!;
      const revision = await this.database.client.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id=${principal.user.id}::uuid FOR UPDATE`;
        const user = await tx.user.findFirst({
          where: {
            id: principal.user.id,
            status: "active",
            credentialVersion: principal.user.credentialVersion,
          },
        });
        const session = await tx.session.findFirst({
          where: {
            id: principal.id,
            userId: principal.user.id,
            revokedAt: null,
            expiresAt: { gt: new Date() },
            idleExpiresAt: { gt: new Date() },
          },
        });
        if (!user || !session) throw new UnauthorizedException();
        const row = await tx.userImage.upsert({
          where: { userId_kind: { userId: user.id, kind } },
          create: { userId: user.id, kind, data },
          update: { data, revision: { increment: 1 } },
        });
        await this.authorization.audit(
          tx,
          user.id,
          `account.${kind}_updated`,
          user.id,
          r.requestId,
          { bytes: data.length, revision: row.revision },
        );
        return row.revision;
      });
      return { url: userImageUrl(kind, revision) };
    } finally {
      this.processing--;
    }
  }
  async get(actor: string, kind: UserImageKind, response: Response) {
    const row = await this.database.client.userImage.findUnique({
      where: { userId_kind: { userId: actor, kind } },
    });
    if (!row) throw new NotFoundException();
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("Content-Type", "image/webp");
    response.setHeader("Content-Length", row.data.length);
    response.setHeader("Content-Disposition", `inline; filename="${kind}.webp"`);
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.send(Buffer.from(row.data));
  }
  async remove(actor: string, kind: UserImageKind, requestId: string) {
    return this.database.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id=${actor}::uuid FOR UPDATE`;
      await tx.userImage.deleteMany({ where: { userId: actor, kind } });
      await this.authorization.audit(tx, actor, `account.${kind}_removed`, actor, requestId);
      return { removed: true };
    });
  }
}
