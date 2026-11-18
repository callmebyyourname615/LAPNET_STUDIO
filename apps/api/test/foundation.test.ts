import "reflect-metadata";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { AddressInfo } from "node:net";
import { createApplication } from "../src/app";
import { readConfig } from "../src/config";
import { PaginationQuery, validationPipe } from "../src/http";
import { apiErrorSchema, paginationSchema, versionSchema } from "@lapnet/contracts";

let app: Awaited<ReturnType<typeof createApplication>>;
let origin: string;
let databaseAvailable = true;

before(async () => {
  process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/test";
  app = await createApplication(
    {
      async check() {
        if (!databaseAvailable) throw new Error("password=must-never-appear");
      },
    },
    false,
  );
  await app.listen(0, "127.0.0.1");
  origin = "http://127.0.0.1:" + (app.getHttpServer().address() as AddressInfo).port;
});
after(async () => {
  await app?.close();
});

test("liveness is independent of the database and has safe headers", async () => {
  databaseAvailable = false;
  const response = await fetch(origin + "/health/live");
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "ok");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.match(response.headers.get("x-request-id")!, /^[0-9a-f-]{36}$/);
  databaseAvailable = true;
});

test("readiness reports a dependency outage without disclosing the error", async () => {
  databaseAvailable = false;
  const response = await fetch(origin + "/health/ready");
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(apiErrorSchema.parse(body).error.code, "DEPENDENCY_UNAVAILABLE");
  assert(!JSON.stringify(body).includes("must-never-appear"));
  assert.equal(body.error.requestId, response.headers.get("x-request-id"));
  databaseAvailable = true;
  assert.equal((await fetch(origin + "/health/ready")).status, 200);
});

test("version satisfies the shared contract and does not expose configuration", async () => {
  const response = await fetch(origin + "/api/v1/version");
  assert.equal(response.status, 200);
  const body = versionSchema.parse(await response.json());
  assert.equal(body.application, "lapnet-studio-portal");
  assert(!JSON.stringify(body).includes("postgresql"));
});

test("the identity boundary denies anonymous access; forged identity headers do not help", async () => {
  const response = await fetch(origin + "/api/v1/me", {
    headers: { "x-user-id": "admin", authorization: "Bearer fake-token", "x-request-id": "forged" },
  });
  assert.equal(response.status, 401);
  const body = apiErrorSchema.parse(await response.json());
  assert.equal(body.error.code, "AUTHENTICATION_REQUIRED");
  assert.notEqual(body.error.requestId, "forged");
});

test("unknown business endpoints return a safe error rather than fixture data", async () => {
  const response = await fetch(origin + "/api/v1/unknown-business/private-record");
  assert.equal(response.status, 404);
  const body = apiErrorSchema.parse(await response.json());
  assert.equal(body.error.code, "NOT_FOUND");
  assert(!JSON.stringify(body).includes("private-record"));
});

test("malformed JSON and oversized requests fail with bounded, redacted errors", async () => {
  for (const [body, status] of [
    ['{"confidential-input":', 400],
    [JSON.stringify({ content: "x".repeat(70000) }), 413],
  ] as const) {
    const response = await fetch(origin + "/api/v1/me", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    assert.equal(response.status, status);
    const result = apiErrorSchema.parse(await response.json());
    assert(!JSON.stringify(result).includes("confidential-input"));
    assert.equal(result.error.requestId, response.headers.get("x-request-id"));
  }
});

test("global input validation bounds pagination and rejects unknown fields", async () => {
  const pipe = validationPipe();
  const metadata = { type: "query" as const, metatype: PaginationQuery };
  assert.equal((await pipe.transform({ limit: "100" }, metadata)).limit, 100);
  assert.equal((await pipe.transform({}, metadata)).limit, 25);
  for (const input of [
    { limit: "101" },
    { limit: "-1" },
    { limit: "1.5" },
    { limit: "NaN" },
    { role: "admin" },
    { cursor: "../secret" },
  ]) {
    await assert.rejects(pipe.transform(input, metadata));
    assert.equal(paginationSchema.safeParse(input).success, false);
  }
});

test("invalid configuration fails closed without returning submitted secrets", () => {
  for (const env of [
    {},
    { DATABASE_URL: "not-a-url-secret" },
    { DATABASE_URL: "https://user:secret@example.com" },
    { DATABASE_URL: "postgresql://user:secret@localhost/test", API_PORT: "NaN" },
  ]) {
    assert.throws(
      () => readConfig(env),
      (error) => error instanceof Error && !error.message.includes("secret"),
    );
  }
});

test("development trusts only loopback aliases on the configured port; production stays exact", () => {
  const database = "postgresql://test:test@127.0.0.1:1/test";
  const local = readConfig({
    DATABASE_URL: database,
    NODE_ENV: "development",
    APP_ORIGIN: "http://127.0.0.1:5173",
  });
  assert.deepEqual(local.allowedOrigins, [
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "http://[::1]:5173",
  ]);
  for (const untrusted of [
    "http://localhost:5174",
    "http://evil.example:5173",
    "http://localhost.evil.example:5173",
    "null",
    "",
  ])
    assert(!local.allowedOrigins.includes(untrusted));
  const production = readConfig({
    DATABASE_URL: database,
    NODE_ENV: "production",
    APP_ORIGIN: "https://portal.example",
  });
  assert.deepEqual(production.allowedOrigins, ["https://portal.example"]);
});
