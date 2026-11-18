import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import { createDatabase } from "@lapnet/database";
import { auditPageSchema } from "@lapnet/contracts";
import { createApplication } from "../src/app";
import { hashPassword, randomSecret } from "../src/identity/password";
import { safeAuditMetadata } from "../src/identity/audit.service";

test("Audit details expose only bounded, explicitly safe metadata", () => {
  assert.deepEqual(
    safeAuditMetadata({
      revision: 3,
      fields: ["displayName"],
      password: "secret",
      cookie: "secret",
      nested: { token: "secret" },
    }),
    { revision: 3, fields: ["displayName"] },
  );
});

test(
  "Highest-role audit access and persistent user activity",
  { skip: !process.env.TEST_IDENTITY_DATABASE_URL },
  async (t) => {
    const connection = process.env.TEST_IDENTITY_DATABASE_URL!;
    const url = new URL(connection);
    assert(
      url.hostname === "127.0.0.1" &&
        url.port === "55432" &&
        /^\/lapnet_identity_[a-f0-9]+$/.test(url.pathname),
    );
    process.env.DATABASE_URL = connection;
    process.env.APP_ORIGIN = "http://127.0.0.1:5173";
    const db = createDatabase(connection),
      password = randomSecret().slice(0, 24),
      encoded = await hashPassword(password);
    const [admin, employee, scoped, ceo] = await Promise.all(
      ["audit_admin", "audit_employee", "audit_editor", "audit_ceo"].map((username) =>
        db.user.create({
          data: {
            username,
            identitySubject: username,
            displayName: username,
            passwordHash: encoded,
            mustChangePassword: false,
          },
        }),
      ),
    );
    const role = await db.roleAssignment.create({
      data: { userId: admin.id, role: "portal_admin", grantedById: admin.id },
    });
    const department = await db.department.findUniqueOrThrow({ where: { code: "AUDIT" } });
    await db.departmentMembership.create({
      data: { userId: employee.id, departmentId: department.id, membershipRole: "manager" },
    });
    await db.roleAssignment.create({
      data: {
        userId: scoped.id,
        departmentId: department.id,
        role: "resource_editor",
        grantedById: admin.id,
      },
    });
    const position = await db.position.findUniqueOrThrow({ where: { code: "CEO" } });
    await db.positionAssignment.create({ data: { userId: ceo.id, positionId: position.id } });
    let app = await createApplication(undefined, false);
    await app.listen(0, "127.0.0.1");
    let origin = "http://127.0.0.1:" + (app.getHttpServer().address() as AddressInfo).port;
    type Client = { cookie: string; csrf: string };
    async function request(c: Client, path: string, method = "GET", body?: unknown, csrf = true) {
      const response = await fetch(origin + path, {
        method,
        headers: {
          origin: process.env.APP_ORIGIN!,
          ...(c.cookie ? { cookie: c.cookie } : {}),
          ...(csrf && c.csrf ? { "x-csrf-token": c.csrf } : {}),
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      const cookie = response.headers.get("set-cookie");
      if (cookie) c.cookie = cookie.split(";")[0];
      const value = await response.json();
      if (value.csrfToken) c.csrf = value.csrfToken;
      return { status: response.status, value, requestId: response.headers.get("x-request-id") };
    }
    async function login(username: string) {
      const c = { cookie: "", csrf: "" };
      assert.equal((await request(c, "/auth/login", "POST", { username, password })).status, 201);
      return c;
    }
    const a = await login(admin.username!),
      e = await login(employee.username!),
      s = await login(scoped.username!),
      c = await login(ceo.username!);
    const endpoint = "/api/v1/audit-events";
    try {
      await t.test(
        "Only a current global portal_admin can see logs; position and department do not grant access",
        async () => {
          assert.equal((await request({ cookie: "", csrf: "" }, endpoint)).status, 401);
          for (const client of [e, s, c]) {
            assert.equal((await request(client, endpoint)).status, 403);
            assert.equal((await request(client, "/api/v1/me")).value.capabilities.viewAudit, false);
          }
          const result = await request(a, endpoint);
          assert.equal(result.status, 200);
          const page = auditPageSchema.parse(result.value);
          assert(
            page.items.some(
              (event) =>
                event.action === "auth.login" && event.actor?.username === employee.username,
            ),
          );
        },
      );
      await t.test(
        "Authenticated reads, successful writes and denied requests are attributed to server identity",
        async () => {
          const update = await request(e, "/api/v1/me/profile", "PATCH", {
            displayName: "Audit Employee",
            fullName: "Personal Name",
            revision: 0,
          });
          assert.equal(update.status, 200);
          const read = await request(e, "/api/v1/search?q=private-search-text");
          assert.equal(read.status, 200);
          const denial = await request(e, "/api/v1/users");
          assert.equal(denial.status, 403);
          const csrf = await request(
            e,
            "/api/v1/me/profile",
            "PATCH",
            { displayName: "Bad", revision: 1 },
            false,
          );
          assert.equal(csrf.status, 403);
          for (const [result, status] of [
            [update, 200],
            [read, 200],
            [denial, 403],
            [csrf, 403],
          ] as const) {
            const event = await db.auditEvent.findFirstOrThrow({
              where: { requestId: result.requestId, action: "activity.request" },
            });
            assert.equal(event.actorId, employee.id);
            assert.equal((event.metadata as { status: number }).status, status);
            assert.equal(event.outcome, status >= 400 ? "failure" : "success");
          }
          assert(
            await db.auditEvent.findFirst({
              where: { action: "account.profile_updated", actorId: employee.id },
            }),
          );
        },
      );
      await t.test(
        "Navigation requires CSRF, accepts bounded application paths and does not trust actor fields",
        async () => {
          const viewed = await request(e, "/api/v1/activity/page-view", "POST", {
            path: "/document-workspace/portal/settings",
          });
          assert.equal(viewed.status, 201);
          const event = await db.auditEvent.findFirstOrThrow({
            where: { action: "activity.page_viewed", requestId: viewed.requestId },
          });
          assert.equal(event.actorId, employee.id);
          assert.deepEqual(event.metadata, { path: "/document-workspace/portal/settings" });
          assert.equal(
            (
              await request(e, "/api/v1/activity/page-view", "POST", {
                path: "/settings",
                actorId: admin.id,
              })
            ).status,
            400,
          );
          assert.equal(
            (
              await request(e, "/api/v1/activity/page-view", "POST", {
                path: "/settings?password=secret",
              })
            ).status,
            400,
          );
          assert.equal(
            (await request(e, "/api/v1/activity/page-view", "POST", { path: "/settings" }, false))
              .status,
            403,
          );
        },
      );
      await t.test(
        "Failed authentication is recorded without falsely identifying an actor or retaining submitted secrets",
        async () => {
          const failed = await request({ cookie: "", csrf: "" }, "/auth/login", "POST", {
            username: employee.username,
            password: "wrong-secret-password",
          });
          assert.equal(failed.status, 401);
          const event = await db.auditEvent.findFirstOrThrow({
            where: { action: "auth.login_failed", requestId: failed.requestId },
          });
          assert.equal(event.actorId, null);
          assert.equal(event.outcome, "failure");
          assert.deepEqual(event.metadata, { attemptedUsername: employee.username });
          const attempts = auditPageSchema.parse(
            (await request(a, endpoint + "?actor=AUDIT_EMPLOYEE&category=auth&outcome=failure"))
              .value,
          );
          assert(attempts.items.some((row) => row.id === event.id));
          const all = JSON.stringify((await db.auditEvent.findMany()).map((row) => row.metadata));
          for (const secret of [
            password,
            encoded,
            "wrong-secret-password",
            e.cookie,
            e.csrf,
            "private-search-text",
            "Personal Name",
          ])
            assert(!all.includes(secret));
        },
      );
      const ids = Array.from({ length: 7 }, () => randomUUID())
          .sort()
          .reverse(),
        fixtureAt = new Date("2025-01-02T03:00:00Z");
      await db.auditEvent.createMany({
        data: ids.map((id, i) => ({
          id,
          actorId: employee.id,
          action: "task.audit_fixture",
          targetId: admin.id,
          requestId: randomUUID(),
          occurredAt: fixtureAt,
          outcome: i === 0 ? "failure" : "success",
          metadata: { revision: 1, password: "never-show-this" },
        })),
      });
      await t.test(
        "Newest-first keyset pages are stable across equal timestamps and newly arriving events",
        async () => {
          const filter = "?limit=3&q=task.audit_fixture";
          const first = auditPageSchema.parse((await request(a, endpoint + filter)).value);
          assert.deepEqual(
            first.items.map((row) => row.id),
            ids.slice(0, 3),
          );
          await db.auditEvent.create({
            data: {
              actorId: admin.id,
              action: "task.audit_fixture",
              occurredAt: new Date(),
              metadata: {},
            },
          });
          const second = auditPageSchema.parse(
            (await request(a, endpoint + filter + "&cursor=" + first.nextCursor)).value,
          );
          const third = auditPageSchema.parse(
            (await request(a, endpoint + filter + "&cursor=" + second.nextCursor)).value,
          );
          assert.deepEqual(
            [...first.items, ...second.items, ...third.items].map((row) => row.id),
            ids,
          );
          assert.equal(third.nextCursor, null);
          assert(!JSON.stringify(first).includes("never-show-this"));
        },
      );
      await t.test(
        "Actor, category, outcome, action and Vientiane date boundaries filter before pagination",
        async () => {
          const filter = new URLSearchParams({
            actor: "AUDIT_EMPLOYEE",
            category: "task",
            outcome: "failure",
            from: "2025-01-02T00:00:00+07:00",
            to: "2025-01-03T00:00:00+07:00",
          });
          const page = auditPageSchema.parse((await request(a, endpoint + "?" + filter)).value);
          assert.equal(page.total, 1);
          assert.equal(page.items[0].id, ids[0]);
          assert.equal(
            auditPageSchema.parse(
              (await request(a, endpoint + "?actor=" + employee.id + "&q=task.audit_fixture"))
                .value,
            ).total,
            7,
          );
          assert.equal(
            auditPageSchema.parse(
              (await request(a, endpoint + "?q=" + admin.id + "&category=task")).value,
            ).total,
            7,
          );
          const boundary = await request(
            a,
            endpoint + "?q=task.audit_fixture&to=2025-01-02T03:00:00Z",
          );
          assert.equal(auditPageSchema.parse(boundary.value).total, 0);
        },
      );
      await t.test(
        "Malformed filters and cursor payloads are rejected, including permission checks before validation",
        async () => {
          for (const query of [
            "limit=101",
            "category=secrets",
            "outcome=any",
            "cursor=bogus",
            "from=bad",
            "from=2026-01-02T00:00:00Z&to=2026-01-01T00:00:00Z",
            "unknown=1",
          ])
            assert.equal((await request(a, endpoint + "?" + query)).status, 400, query);
          assert.equal((await request(e, endpoint + "?cursor=bogus")).status, 403);
          assert.equal((await request(a, endpoint, "DELETE")).status, 404);
          assert.equal((await request(a, endpoint + "/" + ids[0], "PATCH", {})).status, 404);
          await assert.rejects(db.$executeRaw`UPDATE audit_events SET action='tampered'`);
          await assert.rejects(db.$executeRaw`DELETE FROM audit_events`);
        },
      );
      await t.test(
        "Logs survive restarting the API and removing the highest role takes effect immediately",
        async () => {
          await app.close();
          app = await createApplication(undefined, false);
          await app.listen(0, "127.0.0.1");
          origin = "http://127.0.0.1:" + (app.getHttpServer().address() as AddressInfo).port;
          assert.equal(
            auditPageSchema.parse(
              (await request(a, endpoint + "?actor=" + employee.id + "&q=task.audit_fixture"))
                .value,
            ).total,
            7,
          );
          await db.roleAssignment.update({
            where: { id: role.id },
            data: { effectiveTo: new Date() },
          });
          assert.equal((await request(a, "/api/v1/me")).value.capabilities.viewAudit, false);
          assert.equal((await request(a, endpoint)).status, 403);
        },
      );
    } finally {
      await app.close();
      await db.$disconnect();
    }
  },
);
