import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { resolve } from "node:path";
import { local, root, loadEnvironment, pgEnvironment, run } from "./lib.ts";
import pg from "pg";

async function main() {
  const env = loadEnvironment();
  const connectionString = env.MIGRATION_DATABASE_URL;
  if (!connectionString) throw new Error("Migration database configuration is required.");
  const directory = resolve(local, "backups", new Date().toISOString().replaceAll(/[:.]/g, "-"));
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = resolve(directory, "database.dump");
  run("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", "--file", file], {
    env: pgEnvironment(connectionString),
  });
  chmodSync(file, 0o600);
  const db = new pg.Client({ connectionString });
  await db.connect();
  let counts;
  try {
    counts = (
      await db.query(
        "SELECT 'departments' AS name, count(*)::int AS count FROM departments UNION ALL SELECT 'users', count(*)::int FROM users UNION ALL SELECT 'reporting_lines', count(*)::int FROM reporting_lines UNION ALL SELECT 'collaboration_links', count(*)::int FROM collaboration_links UNION ALL SELECT 'role_assignments', count(*)::int FROM role_assignments UNION ALL SELECT 'sessions', count(*)::int FROM sessions UNION ALL SELECT 'audit_events', count(*)::int FROM audit_events UNION ALL SELECT 'resources', count(*)::int FROM resources UNION ALL SELECT 'resource_grants', count(*)::int FROM resource_grants UNION ALL SELECT 'tasks', count(*)::int FROM tasks UNION ALL SELECT 'task_collaborators', count(*)::int FROM task_collaborators UNION ALL SELECT 'task_revisions', count(*)::int FROM task_revisions",
      )
    ).rows;
  } finally {
    await db.end();
  }
  const configs = [
    "package.json",
    "pnpm-lock.yaml",
    "packages/database/prisma/schema.prisma",
    "infra/compose/compose.yml",
    "infra/nginx/default.conf",
  ];
  for (const name of configs) {
    const destination = resolve(directory, "configuration", name);
    mkdirSync(resolve(destination, ".."), { recursive: true, mode: 0o700 });
    writeFileSync(destination, readFileSync(resolve(root, name)), { mode: 0o600 });
  }
  writeFileSync(
    resolve(directory, "manifest.json"),
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        revision: env.RELEASE_REVISION ?? "development",
        sha256: createHash("sha256").update(readFileSync(file)).digest("hex"),
        counts,
        configs,
        scope:
          "Portal database (including tasks and business history) and non-secret configuration. Local capture is not an independent production backup. Requires a quiescent development database for count comparison.",
      },
      null,
      2,
    ) + "\n",
    { mode: 0o600 },
  );
  console.log(`Backup captured: ${directory}`);
}
main().catch(() => {
  console.error("Backup capture failed; verify tools and database configuration.");
  process.exitCode = 1;
});
