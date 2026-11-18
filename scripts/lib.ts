import { readFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import type { SpawnSyncOptionsWithStringEncoding } from "node:child_process";
import { parse } from "dotenv";

export const root = fileURLToPath(new URL("../", import.meta.url));
export const local = resolve(root, ".local");
export function localDirectory() {
  mkdirSync(local, { recursive: true, mode: 0o700 });
}
export function loadEnvironment(): NodeJS.ProcessEnv {
  const path = resolve(root, ".env");
  return { ...(existsSync(path) ? parse(readFileSync(path)) : {}), ...process.env };
}
export function requireLocalDevelopment(env: NodeJS.ProcessEnv) {
  if (!env.MIGRATION_DATABASE_URL) throw new Error("MIGRATION_DATABASE_URL is required.");
  const url = new URL(env.MIGRATION_DATABASE_URL);
  if (
    env.LAPNET_ENV !== "development" ||
    url.hostname !== "127.0.0.1" ||
    url.port !== "55432" ||
    url.pathname !== "/lapnet_dev"
  )
    throw new Error("This command requires the isolated LAPNet development database.");
}
export function run(
  command: string,
  args: string[],
  options: Omit<SpawnSyncOptionsWithStringEncoding, "encoding"> = {},
): string {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", ...options });
  if (result.error || result.status !== 0)
    throw new Error(`${command} failed. Check prerequisites and the private service log.`);
  return result.stdout;
}
export function pgEnvironment(connectionString: string): NodeJS.ProcessEnv {
  const url = new URL(connectionString);
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    PGOPTIONS: "",
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGCONNECT_TIMEOUT: "5",
  };
  delete environment.PGSERVICE;
  delete environment.PGSERVICEFILE;
  return environment;
}
export const sqlLiteral = (value: string) => "'" + value.replaceAll("'", "''") + "'";
export const sqlIdentifier = (value: string) => '"' + value.replaceAll('"', '""') + '"';
