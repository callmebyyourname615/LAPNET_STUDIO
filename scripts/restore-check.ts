import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import {
  local,
  loadEnvironment,
  requireLocalDevelopment,
  pgEnvironment,
  run,
  sqlIdentifier,
} from "./lib.ts";

async function main() {
  const env = loadEnvironment();
  requireLocalDevelopment(env);
  if (!env.MIGRATION_DATABASE_URL || !env.POSTGRES_PASSWORD)
    throw new Error("Development recovery configuration is missing.");
  const backups = resolve(local, "backups");
  const latest = readdirSync(backups)
    .filter((name) => /^\d{4}-/.test(name))
    .sort()
    .at(-1);
  if (!latest) throw new Error("No local backup exists.");
  const directory = resolve(backups, latest);
  const file = resolve(directory, "database.dump");
  const manifest = JSON.parse(readFileSync(resolve(directory, "manifest.json"), "utf8"));
  assert.equal(createHash("sha256").update(readFileSync(file)).digest("hex"), manifest.sha256);
  const adminUrl = new URL(env.MIGRATION_DATABASE_URL);
  adminUrl.username = "lapnet_bootstrap";
  adminUrl.password = env.POSTGRES_PASSWORD;
  adminUrl.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  const name = "lapnet_restore_" + randomBytes(8).toString("hex");
  const started = performance.now();
  let created = false;
  try {
    await admin.query(`CREATE DATABASE ${sqlIdentifier(name)} OWNER lapnet_migrator`);
    created = true;
    const restoreUrl = new URL(env.MIGRATION_DATABASE_URL);
    restoreUrl.pathname = "/" + name;
    run(
      "pg_restore",
      ["--exit-on-error", "--no-owner", "--no-privileges", "--dbname", name, file],
      { env: pgEnvironment(restoreUrl.toString()) },
    );
    const restored = new pg.Client({ connectionString: restoreUrl.toString() });
    await restored.connect();
    try {
      for (const entry of manifest.counts) {
        const value = (
          await restored.query(`SELECT count(*)::int AS count FROM ${sqlIdentifier(entry.name)}`)
        ).rows[0].count;
        assert.equal(value, entry.count, entry.name);
      }
      assert.equal(
        (
          await restored.query(
            "SELECT count(*)::int AS count FROM reporting_lines r JOIN departments d ON d.id=r.department_id JOIN positions p ON p.id=r.position_id WHERE d.code='AUDIT' AND p.code='BOARD'",
          )
        ).rows[0].count,
        1,
      );
      assert(
        (
          await restored.query(
            "SELECT count(*)::int AS count FROM _prisma_migrations WHERE finished_at IS NOT NULL",
          )
        ).rows[0].count > 0,
      );
      if (manifest.counts.some((entry: { name: string }) => entry.name === "tasks")) {
        const invalid = await restored.query(`
          SELECT count(*)::int AS count FROM tasks t
          JOIN resources s ON s.id=t.id
          LEFT JOIN task_revisions r ON r.task_id=t.id AND r.revision=t.revision
          WHERE r.id IS NULL OR s.kind<>'task'
            OR r.snapshot->>'title' IS DISTINCT FROM t.title
            OR r.snapshot->>'description' IS DISTINCT FROM t.description
            OR r.snapshot->>'status' IS DISTINCT FROM t.status::text
            OR r.snapshot->>'priority' IS DISTINCT FROM t.priority::text
            OR r.snapshot->>'dueDate' IS DISTINCT FROM to_char(t.due_date,'YYYY-MM-DD')
            OR r.snapshot->'assignee'->>'id' IS DISTINCT FROM t.assignee_id::text
            OR (r.snapshot->>'archived')::boolean IS DISTINCT FROM (s.archived_at IS NOT NULL)
        `);
        assert.equal(invalid.rows[0].count, 0, "task revision snapshots and resource links");
        const hasAssigner = await restored.query(
          "SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tasks' AND column_name='assigned_by_id'",
        );
        if (hasAssigner.rows.length) {
          const invalidAssigner = await restored.query(`
            WITH revisions AS (
              SELECT task_id,actor_id,revision,snapshot->'assignee'->>'id' AS assignee_id,
                lag(snapshot->'assignee'->>'id') OVER (PARTITION BY task_id ORDER BY revision) AS previous_id
              FROM task_revisions
            ), assignments AS (
              SELECT DISTINCT ON(task_id) task_id,actor_id FROM revisions
              WHERE assignee_id IS DISTINCT FROM previous_id ORDER BY task_id,revision DESC
            )
            SELECT count(*)::int AS count FROM tasks t
            LEFT JOIN assignments a ON a.task_id=t.id
            WHERE t.assigned_by_id IS DISTINCT FROM a.actor_id
          `);
          assert.equal(
            invalidAssigner.rows[0].count,
            0,
            "task assigner matches assignment history",
          );
        }
        assert.equal(
          (
            await restored.query(
              "SELECT (SELECT last_value FROM tasks_number_seq) >= coalesce(max(number),0) AS valid FROM tasks",
            )
          ).rows[0].valid,
          true,
          "task number sequence",
        );
      }
    } finally {
      await restored.end();
    }
    console.log(
      JSON.stringify({
        result: "restore_verified",
        backup: latest,
        durationMs: Math.round(performance.now() - started),
        checked:
          "checksum, captured row counts, Audit reporting, migration history, task revision snapshots/resource links/number sequence when present",
        scope: "isolated local database; production recovery and document files not yet verified",
      }),
    );
  } finally {
    if (created) await admin.query(`DROP DATABASE ${sqlIdentifier(name)} WITH (FORCE)`);
    await admin.end();
  }
}
main().catch(() => {
  console.error(
    "Isolated restore verification failed; the live database was not a restore target.",
  );
  process.exitCode = 1;
});
