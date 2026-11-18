import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { root, local, loadEnvironment, requireLocalDevelopment, localDirectory } from "./lib.ts";

const require = createRequire(resolve(root, "apps/api/package.json"));
const password = require("./dist/src/identity/password.js") as {
  hashPassword: (value: string) => Promise<string>;
  randomSecret: () => string;
};
async function main() {
  const env = loadEnvironment();
  requireLocalDevelopment(env);
  localDirectory();
  const recover = process.argv.includes("--recover");
  const db = new pg.Client({ connectionString: env.MIGRATION_DATABASE_URL });
  await db.connect();
  try {
    await db.query("BEGIN");
    await db.query("SELECT pg_advisory_xact_lock(27681,2)");
    const admins = (
      await db.query("SELECT user_id FROM role_assignments WHERE role='portal_admin'")
    ).rows;
    if (admins.length && !recover) {
      await db.query("ROLLBACK");
      console.log(
        "An administrator already exists. Use the existing account. Local initial access file: .local/admin-access.json",
      );
      return;
    }
    const temporaryPassword = password.randomSecret().slice(0, 24);
    const encoded = await password.hashPassword(temporaryPassword);
    let id = randomUUID();
    if (recover) {
      const row = (
        await db.query(
          "SELECT u.id FROM users u JOIN role_assignments r ON r.user_id=u.id WHERE u.username='admin' AND r.role='portal_admin' LIMIT 1",
        )
      ).rows[0];
      if (!row)
        throw new Error("The original local administrator cannot be recovered by this command.");
      id = row.id;
      await db.query(
        "UPDATE users SET password_hash=$2,must_change_password=false,status='active',credential_version=credential_version+1,updated_at=now() WHERE id=$1",
        [id, encoded],
      );
      await db.query(
        "UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL",
        [id],
      );
    } else
      await db.query(
        "INSERT INTO users(id,identity_subject,username,display_name,password_hash,must_change_password,updated_at) VALUES($1,$2,'admin','ຜູ້ດູແລລະບົບ',$3,false,now())",
        [id, "local:" + id, encoded],
      );
    if (
      !(
        await db.query(
          "SELECT 1 FROM role_assignments WHERE user_id=$1 AND role='portal_admin' AND effective_from<=now() AND (effective_to IS NULL OR effective_to>now())",
          [id],
        )
      ).rowCount
    )
      await db.query(
        "INSERT INTO role_assignments(id,user_id,role,granted_by_id) VALUES($1,$2,'portal_admin',$2)",
        [randomUUID(), id],
      );
    if (!recover)
      await db.query(
        "INSERT INTO department_memberships(id,user_id,department_id) SELECT $1,$2,id FROM departments WHERE code='OFFICE'",
        [randomUUID(), id],
      );
    await db.query(
      "INSERT INTO audit_events(id,actor_id,action,target_id,metadata) VALUES($1,NULL,$2,$3,$4)",
      [
        randomUUID(),
        recover ? "auth.admin_recovered" : "auth.admin_bootstrapped",
        id,
        JSON.stringify({ source: "local_operator_cli" }),
      ],
    );
    await db.query("COMMIT");
    writeFileSync(
      resolve(local, "admin-access.json"),
      JSON.stringify(
        {
          url: "http://127.0.0.1:5173/sign-in",
          username: "admin",
          temporaryPassword,
          mustChangePassword: false,
          notice: "ຫ້າມແບ່ງປັນໄຟລ໌ນີ້. ສາມາດປ່ຽນລະຫັດຜ່ານໄດ້ໃນໜ້າບັນຊີ.",
        },
        null,
        2,
      ) + "\n",
      { mode: 0o600 },
    );
    console.log(
      "Local administrator ready. Read the private .local/admin-access.json file; password was not logged. First login requires a password change.",
    );
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    await db.end();
  }
}
main().catch(() => {
  console.error(
    "Administrator bootstrap failed. No passwords were logged. Check migrations and existing administrator state.",
  );
  process.exitCode = 1;
});
