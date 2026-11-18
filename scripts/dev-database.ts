import { existsSync, writeFileSync, readFileSync, mkdirSync, chmodSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import pg from "pg";
import {
  root,
  local,
  localDirectory,
  loadEnvironment,
  requireLocalDevelopment,
  run,
  sqlLiteral,
} from "./lib.ts";

async function main() {
  const action = process.argv[2] ?? "start";
  if (!["start", "stop", "restart", "status"].includes(action))
    throw new Error("Use start, stop, restart, or status.");
  localDirectory();
  const data = resolve(local, "postgres");
  if (["stop", "restart", "status"].includes(action)) {
    if (!existsSync(resolve(data, "PG_VERSION")))
      throw new Error("Project database has not been initialized.");
    const args = ["-D", data, action];
    if (action !== "status") args.push("-w");
    if (action === "restart") args.push("-l", resolve(local, "postgres.log"));
    run("pg_ctl", args);
    console.log(`Project PostgreSQL: ${action}.`);
    return;
  }
  const envPath = resolve(root, ".env");
  if (!existsSync(envPath)) {
    const [admin, migrator, runtime] = Array.from({ length: 3 }, () =>
      randomBytes(32).toString("hex"),
    );
    writeFileSync(
      envPath,
      `LAPNET_ENV=development\nAPI_HOST=127.0.0.1\nAPI_PORT=3100\nDATABASE_URL=postgresql://lapnet_runtime:${runtime}@127.0.0.1:55432/lapnet_dev\nMIGRATION_DATABASE_URL=postgresql://lapnet_migrator:${migrator}@127.0.0.1:55432/lapnet_dev\nPOSTGRES_PASSWORD=${admin}\nRUNTIME_PASSWORD=${runtime}\nMIGRATOR_PASSWORD=${migrator}\nRELEASE_REVISION=development\n`,
      { mode: 0o600, flag: "wx" },
    );
  }
  const env = loadEnvironment();
  requireLocalDevelopment(env);
  const adminPassword = env.POSTGRES_PASSWORD;
  const runtimePassword = env.RUNTIME_PASSWORD;
  const migratorPassword = env.MIGRATOR_PASSWORD;
  if (!adminPassword || !runtimePassword || !migratorPassword)
    throw new Error("Development bootstrap credentials are missing.");
  chmodSync(envPath, 0o600);
  const passwordFile = resolve(local, "bootstrap-password");
  if (!existsSync(resolve(data, "PG_VERSION"))) {
    writeFileSync(passwordFile, adminPassword, { mode: 0o600 });
    run("initdb", [
      "-D",
      data,
      "-U",
      "lapnet_bootstrap",
      "--encoding=UTF8",
      "--locale=C",
      "--auth-host=scram-sha-256",
      "--auth-local=trust",
      `--pwfile=${passwordFile}`,
    ]);
    const socket = resolve(local, "socket");
    mkdirSync(socket, { recursive: true, mode: 0o700 });
    writeFileSync(
      resolve(data, "postgresql.auto.conf"),
      `listen_addresses = '127.0.0.1'\nport = 55432\nunix_socket_directories = ${sqlLiteral(socket)}\nmax_connections = 30\nshared_buffers = '64MB'\nlogging_collector = off\nlog_statement = 'none'\nlog_min_error_statement = 'panic'\n`,
    );
  } else if (readFileSync(passwordFile, "utf8") !== adminPassword) {
    throw new Error("Bootstrap credentials differ from the initialized project cluster.");
  }
  const status = (() => {
    try {
      run("pg_ctl", ["-D", data, "status"]);
      return true;
    } catch {
      return false;
    }
  })();
  if (!status) run("pg_ctl", ["-D", data, "-l", resolve(local, "postgres.log"), "-w", "start"]);
  const admin = new pg.Client({
    host: "127.0.0.1",
    port: 55432,
    user: "lapnet_bootstrap",
    password: adminPassword,
    database: "postgres",
    connectionTimeoutMillis: 3000,
  });
  await admin.connect();
  try {
    for (const [role, password] of [
      ["lapnet_migrator", migratorPassword],
      ["lapnet_runtime", runtimePassword],
    ]) {
      if (!(await admin.query("SELECT 1 FROM pg_roles WHERE rolname=$1", [role])).rowCount)
        await admin.query(
          `CREATE ROLE ${role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD ${sqlLiteral(password)}`,
        );
    }
    if (!(await admin.query("SELECT 1 FROM pg_database WHERE datname='lapnet_dev'")).rowCount)
      await admin.query("CREATE DATABASE lapnet_dev OWNER lapnet_migrator");
    await admin.query("REVOKE ALL ON DATABASE lapnet_dev FROM PUBLIC");
    await admin.query("GRANT CONNECT ON DATABASE lapnet_dev TO lapnet_runtime");
  } finally {
    await admin.end();
  }
  const database = new pg.Client({
    host: "127.0.0.1",
    port: 55432,
    user: "lapnet_bootstrap",
    password: adminPassword,
    database: "lapnet_dev",
  });
  await database.connect();
  try {
    await database.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
    await database.query("GRANT USAGE ON SCHEMA public TO lapnet_runtime");
    await database.query(
      "ALTER DEFAULT PRIVILEGES FOR ROLE lapnet_migrator IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO lapnet_runtime",
    );
    await database.query(
      "ALTER DEFAULT PRIVILEGES FOR ROLE lapnet_migrator IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO lapnet_runtime",
    );
  } finally {
    await database.end();
  }
  console.log(
    "Isolated LAPNet PostgreSQL ready on 127.0.0.1:55432. Credentials are private in .env.",
  );
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Development database failed.");
  process.exitCode = 1;
});
