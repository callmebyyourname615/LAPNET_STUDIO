import { randomBytes } from "node:crypto";
import pg from "pg";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvironment, requireLocalDevelopment, sqlIdentifier, run, local } from "./lib.ts";

async function main() {
  const env = loadEnvironment();
  requireLocalDevelopment(env);
  if (!env.MIGRATION_DATABASE_URL || !env.DATABASE_URL || !env.POSTGRES_PASSWORD)
    throw new Error("Missing development database configuration");
  const suite = [
    "tasks",
    "team",
    "notifications",
    "business",
    "documents",
    "account",
    "audit",
  ].includes(process.argv[2] ?? "")
    ? process.argv[2]
    : "identity";
  const name = "lapnet_identity_" + randomBytes(8).toString("hex");
  const adminUrl = new URL(env.MIGRATION_DATABASE_URL);
  adminUrl.username = "lapnet_bootstrap";
  adminUrl.password = env.POSTGRES_PASSWORD;
  adminUrl.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  let created = false;
  try {
    await admin.query(`CREATE DATABASE ${sqlIdentifier(name)} OWNER lapnet_migrator`);
    created = true;
    await admin.query(`REVOKE ALL ON DATABASE ${sqlIdentifier(name)} FROM PUBLIC`);
    await admin.query(`GRANT CONNECT ON DATABASE ${sqlIdentifier(name)} TO lapnet_runtime`);
    const setupUrl = new URL(adminUrl);
    setupUrl.pathname = "/" + name;
    const setup = new pg.Client({ connectionString: setupUrl.toString() });
    await setup.connect();
    try {
      await setup.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
      await setup.query("GRANT USAGE ON SCHEMA public TO lapnet_runtime");
      await setup.query(
        "ALTER DEFAULT PRIVILEGES FOR ROLE lapnet_migrator IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO lapnet_runtime",
      );
    } finally {
      await setup.end();
    }
    const migrationUrl = new URL(env.MIGRATION_DATABASE_URL);
    migrationUrl.pathname = "/" + name;
    const runtimeUrl = new URL(env.DATABASE_URL);
    runtimeUrl.pathname = "/" + name;
    const testEnv = {
      ...process.env,
      MIGRATION_DATABASE_URL: migrationUrl.toString(),
      DATABASE_URL: runtimeUrl.toString(),
      TEST_IDENTITY_DATABASE_URL: runtimeUrl.toString(),
      APP_ORIGIN: "http://127.0.0.1:5173",
    };
    run("pnpm", ["db:migrate"], { env: testEnv });
    run("pnpm", ["db:seed"], { env: testEnv });
    const result = spawnSync(
      process.execPath,
      ["--test", `apps/api/dist/test/${suite}.integration.test.js`],
      { env: testEnv, encoding: "utf8", maxBuffer: 2 * 1024 * 1024 },
    );
    const report = (result.stdout + "\n" + result.stderr)
      .replace(/postgres(?:ql)?:\/\/[^\s]+/g, "[REDACTED_DATABASE_URL]")
      .replace(/\$argon2id\$[^\s"']+/g, "[REDACTED_PASSWORD_HASH]");
    writeFileSync(resolve(local, `${suite}-test-results.txt`), report, { mode: 0o600 });
    console.log(report);
    if (result.status !== 0) throw new Error("Integration checks failed");
  } finally {
    if (created) await admin.query(`DROP DATABASE ${sqlIdentifier(name)} WITH (FORCE)`);
    await admin.end();
  }
}
main().catch(() => {
  console.error(
    "Identity integration verification failed. Test output and configuration are private; no credentials were logged.",
  );
  process.exitCode = 1;
});
