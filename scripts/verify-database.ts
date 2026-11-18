import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { loadEnvironment, requireLocalDevelopment } from "./lib.ts";

const pgError = (code: string) => (error: unknown) =>
  error instanceof Error && "code" in error && error.code === code;

async function main() {
  const env = loadEnvironment();
  requireLocalDevelopment(env);
  const runtime = new pg.Client({ connectionString: env.DATABASE_URL });
  await runtime.connect();
  try {
    const roles = (
      await runtime.query(
        "SELECT rolsuper, rolcreatedb, rolcreaterole, rolbypassrls FROM pg_roles WHERE rolname=current_user",
      )
    ).rows[0];
    assert(Object.values(roles).every((value) => value === false));
    assert.equal(
      (await runtime.query("SELECT count(*)::int AS count FROM departments")).rows[0].count,
      5,
    );
    const lines = (
      await runtime.query(
        "SELECT d.name, p.code FROM reporting_lines r JOIN departments d ON r.department_id=d.id JOIN positions p ON r.position_id=p.id WHERE r.effective_to IS NULL ORDER BY d.name",
      )
    ).rows;
    assert.deepEqual(lines, [
      { name: "Audit", code: "BOARD" },
      { name: "Finance", code: "CEO" },
      { name: "IT", code: "CFO" },
      { name: "Office", code: "CEO" },
      { name: "Operation", code: "CFO" },
    ]);
    assert.equal(
      (await runtime.query("SELECT count(*)::int AS count FROM collaboration_links")).rows[0].count,
      7,
    );
    await assert.rejects(
      runtime.query("CREATE TABLE public.runtime_must_not_own_schema (id int)"),
      pgError("42501"),
    );
    await assert.rejects(runtime.query("SELECT * FROM _prisma_migrations"), pgError("42501"));
    await runtime.query("BEGIN");
    const id = randomUUID();
    try {
      await runtime.query(
        "INSERT INTO users(id,identity_subject,display_name,updated_at) VALUES($1,$2,$3,now())",
        [id, "synthetic-foundation-check", "Synthetic foundation verification"],
      );
      const department = (await runtime.query("SELECT id FROM departments WHERE code='IT'")).rows[0]
        .id;
      const resource = randomUUID();
      await runtime.query(
        "INSERT INTO resources(id,kind,owner_user_id,owner_department_id) VALUES($1,'task',$2,$3)",
        [resource, id, department],
      );
      await assert.rejects(
        runtime.query(
          "INSERT INTO resource_grants(id,resource_id,permission,granted_by_id) VALUES($1,$2,'view',$3)",
          [randomUUID(), resource, id],
        ),
        pgError("23514"),
      );
    } finally {
      await runtime.query("ROLLBACK");
    }
    const subject = "synthetic-persistence-probe";
    if (process.argv.includes("--after-restart")) {
      assert.equal(
        (await runtime.query("SELECT display_name FROM users WHERE identity_subject=$1", [subject]))
          .rows[0]?.display_name,
        "Synthetic persistence probe",
      );
      await runtime.query("DELETE FROM users WHERE identity_subject=$1", [subject]);
      console.log("Persistence survived PostgreSQL restart; synthetic probe removed.");
    } else {
      await runtime.query(
        "INSERT INTO users(id,identity_subject,display_name,updated_at) VALUES($1,$2,$3,now()) ON CONFLICT(identity_subject) DO NOTHING",
        [randomUUID(), subject, "Synthetic persistence probe"],
      );
      console.log(
        "Database checks passed; persistence probe committed for restart and restore verification.",
      );
    }
  } finally {
    await runtime.end();
  }
}
main().catch(() => {
  console.error("Database verification failed. No credentials or record contents were logged.");
  process.exitCode = 1;
});
