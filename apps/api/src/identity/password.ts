import { hash, verify, argon2id } from "argon2";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

export const secretHash = (value: string) => createHash("sha256").update(value).digest("hex");
export const randomSecret = () => randomBytes(32).toString("base64url");
export const hashPassword = (password: string) =>
  hash(password, { type: argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
export const verifyPassword = (encoded: string, password: string) =>
  verify(encoded, password).catch(() => false);
export function equalSecret(a: string, b: string) {
  return timingSafeEqual(Buffer.from(secretHash(a)), Buffer.from(secretHash(b)));
}
