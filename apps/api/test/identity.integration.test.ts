import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import { createDatabase } from "@lapnet/database";
import { createApplication } from "../src/app";
import { hashPassword, randomSecret, secretHash } from "../src/identity/password";
import { readConfig } from "../src/config";

test(
  "Phase 02 identity and authorization integration",
  { skip: !process.env.TEST_IDENTITY_DATABASE_URL },
  async (t) => {
    const connection = process.env.TEST_IDENTITY_DATABASE_URL!;
    const url = new URL(connection);
    assert(
      url.hostname === "127.0.0.1" &&
        url.port === "55432" &&
        /^\/lapnet_identity_[0-9a-f]+$/.test(url.pathname),
      "Integration tests require an isolated disposable database",
    );
    process.env.DATABASE_URL = connection;
    process.env.APP_ORIGIN = "http://127.0.0.1:5173";
    const db = createDatabase(connection);
    const password = randomSecret().slice(0, 24);
    const encoded = await hashPassword(password);
    const created = await Promise.all(
      ["admin", "finance", "it_user", "office", "ceo", "auditor"].map((username) =>
        db.user.create({
          data: {
            identitySubject: "test:" + username,
            username,
            displayName: username,
            passwordHash: encoded,
            mustChangePassword: false,
          },
        }),
      ),
    );
    const [admin, finance, it, office, ceo, auditor] = created;
    await db.$executeRaw`INSERT INTO role_assignments(id,user_id,role,granted_by_id) VALUES(gen_random_uuid(),${admin.id}::uuid,'portal_admin',${admin.id}::uuid)`;
    const departments = await db.department.findMany();
    const department = (code: string) => departments.find((x) => x.code === code)!.id;
    for (const [user, code] of [
      [finance, "FINANCE"],
      [it, "IT"],
      [office, "OFFICE"],
      [auditor, "AUDIT"],
    ] as const)
      await db.departmentMembership.create({
        data: { userId: user.id, departmentId: department(code) },
      });
    const position = await db.position.findUniqueOrThrow({ where: { code: "CEO" } });
    await db.positionAssignment.create({ data: { userId: ceo.id, positionId: position.id } });
    const financial = await db.resource.create({
      data: { kind: "document", ownerUserId: finance.id, ownerDepartmentId: department("FINANCE") },
    });
    const secondFinancial = await db.resource.create({
      data: { kind: "task", ownerUserId: finance.id, ownerDepartmentId: department("FINANCE") },
    });
    const restricted = await db.resource.create({
      data: { kind: "document", ownerUserId: auditor.id, ownerDepartmentId: department("AUDIT") },
    });
    const app = await createApplication(undefined, false);
    await app.listen(0, "127.0.0.1");
    const origin = "http://127.0.0.1:" + (app.getHttpServer().address() as AddressInfo).port;
    type Client = { cookie: string; csrf: string };
    const client = (): Client => ({ cookie: "", csrf: "" });
    async function request(
      c: Client,
      path: string,
      method = "GET",
      body?: unknown,
      extra: Record<string, string> = {},
    ) {
      const response = await fetch(origin + path, {
        method,
        headers: {
          origin: process.env.APP_ORIGIN!,
          ...(c.cookie ? { cookie: c.cookie } : {}),
          ...(c.csrf ? { "x-csrf-token": c.csrf } : {}),
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
          ...extra,
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      const cookie = response.headers.get("set-cookie");
      if (cookie) c.cookie = cookie.split(";")[0];
      const value = await response.json();
      if (typeof value.csrfToken === "string") c.csrf = value.csrfToken;
      return { status: response.status, value, headers: response.headers };
    }
    async function login(username: string, secret = password) {
      const c = client();
      const result = await request(c, "/auth/login", "POST", { username, password: secret });
      assert.equal(result.status, 201);
      return c;
    }
    try {
      await t.test(
        "database timestamps use UTC and SQL-created administrator roles are effective",
        async () => {
          const rows = await db.$queryRaw<
            { zone: string; instant: Date }[]
          >`SELECT current_setting('timezone') AS zone,now() AS instant`;
          assert.equal(rows[0].zone, "UTC");
          assert(Math.abs(rows[0].instant.getTime() - Date.now()) < 5000);
          assert.equal(
            (await request(await login("admin"), "/api/v1/me")).value.capabilities.manageUsers,
            true,
          );
        },
      );
      const adminClient = await login("admin");
      const financeClient = await login("finance");
      const itClient = await login("it_user");
      const officeClient = await login("office");
      const ceoClient = await login("ceo");
      await t.test(
        "localhost login and CSRF mutations work, while other ports and cross-site requests fail",
        async () => {
          const localClient = client();
          const logged = await request(
            localClient,
            "/auth/login",
            "POST",
            { username: "finance", password },
            { origin: "http://localhost:5173", "sec-fetch-site": "same-origin" },
          );
          assert.equal(logged.status, 201);
          assert.equal(
            (
              await request(localClient, "/auth/logout", "POST", undefined, {
                origin: "http://localhost:5173",
                "sec-fetch-site": "same-origin",
              })
            ).status,
            201,
          );
          for (const headers of [
            { origin: "http://localhost:5174", "sec-fetch-site": "same-origin" },
            { origin: "http://localhost.evil.example:5173", "sec-fetch-site": "same-origin" },
            { origin: "http://localhost:5173", "sec-fetch-site": "cross-site" },
          ]) {
            assert.equal(
              (
                await request(
                  client(),
                  "/auth/login",
                  "POST",
                  { username: "finance", password },
                  headers,
                )
              ).status,
              403,
            );
          }
        },
      );
      await t.test(
        "passwords use Argon2id; session cookie is HttpOnly and only its hash is stored",
        async () => {
          assert(encoded.startsWith("$argon2id$"));
          const token = adminClient.cookie.split("=")[1];
          const session = await db.session.findUnique({ where: { tokenHash: secretHash(token) } });
          assert(session);
          assert(session.tokenHash !== token);
          const result = await request(adminClient, "/api/v1/me");
          assert.equal(result.status, 200);
          assert(!JSON.stringify(result.value).includes("passwordHash"));
          assert(!JSON.stringify(result.value).includes("tokenHash"));
          const secure = readConfig({
            DATABASE_URL: connection,
            NODE_ENV: "production",
            APP_ORIGIN: "https://portal.example",
          });
          assert(secure.secureCookies);
          assert.equal(secure.cookieName, "__Host-lapnet_session");
        },
      );
      await t.test("invalid credentials and origin cannot establish a session", async () => {
        assert.equal(
          (
            await request(client(), "/auth/login", "POST", {
              username: "finance",
              password: "incorrect",
            })
          ).status,
          401,
        );
        assert.equal(
          (
            await request(client(), "/auth/login", "POST", {
              username: "nobody",
              password: "incorrect",
            })
          ).status,
          401,
        );
        assert.equal(
          (
            await request(
              client(),
              "/auth/login",
              "POST",
              { username: "finance", password },
              { origin: "https://evil.example" },
            )
          ).status,
          403,
        );
        assert.equal((await request(client(), "/api/v1/me")).status, 401);
      });
      await t.test(
        "administration rights do not imply business read access; titles/reporting/collaboration grant nothing",
        async () => {
          assert.equal((await request(adminClient, "/api/v1/resources")).value.total, 0);
          assert.equal((await request(officeClient, "/api/v1/resources")).value.total, 0);
          assert.equal((await request(ceoClient, "/api/v1/resources")).value.total, 0);
          assert.equal((await request(itClient, "/api/v1/resources/" + restricted.id)).status, 404);
          assert.equal((await request(itClient, "/api/v1/users")).status, 403);
          assert.equal((await request(itClient, "/api/v1/audit-events")).status, 403);
        },
      );
      await t.test(
        "mutations require both origin and CSRF; payloads cannot assign roles",
        async () => {
          assert.equal(
            (
              await request({ ...adminClient, csrf: "" }, "/api/v1/users", "POST", {
                username: "forged",
                displayName: "Forged",
              })
            ).status,
            403,
          );
          assert.equal(
            (
              await request(adminClient, "/api/v1/users", "POST", {
                username: "forged",
                displayName: "Forged",
                role: "portal_admin",
              })
            ).status,
            400,
          );
          assert.equal(
            (
              await request(
                adminClient,
                "/api/v1/users",
                "POST",
                { username: "forged", displayName: "Forged" },
                { origin: "https://evil.example" },
              )
            ).status,
            403,
          );
        },
      );
      await t.test(
        "explicit sharing applies to one record; revocation applies to detail, list and count",
        async () => {
          const shared = await request(
            financeClient,
            "/api/v1/resources/" + financial.id + "/grants",
            "POST",
            { userId: it.id, permission: "view" },
          );
          assert.equal(shared.status, 201);
          const list = await request(itClient, "/api/v1/resources?limit=1");
          assert.equal(list.value.total, 1);
          assert.equal(list.value.items.length, 1);
          assert.equal((await request(itClient, "/api/v1/resources/" + financial.id)).status, 200);
          assert.equal(
            (await request(itClient, "/api/v1/resources/" + secondFinancial.id)).status,
            404,
          );
          assert.equal(
            (
              await request(itClient, "/api/v1/resources/" + financial.id + "/grants", "POST", {
                userId: office.id,
                permission: "edit",
              })
            ).status,
            403,
          );
          assert.equal(
            (
              await request(
                financeClient,
                "/api/v1/resources/" + financial.id + "/grants/" + shared.value.id,
                "DELETE",
              )
            ).status,
            200,
          );
          assert.equal((await request(itClient, "/api/v1/resources/" + financial.id)).status, 404);
          assert.equal((await request(itClient, "/api/v1/resources")).value.total, 0);
        },
      );
      await t.test(
        "approved scoped roles grant only the selected department; role revocation is immediate",
        async () => {
          const assigned = await request(adminClient, "/api/v1/roles", "POST", {
            userId: ceo.id,
            role: "resource_viewer",
            departmentId: department("FINANCE"),
          });
          assert.equal(assigned.status, 201);
          const list = await request(ceoClient, "/api/v1/resources?limit=1");
          assert.equal(list.value.total, 2);
          assert(list.value.nextCursor);
          const next = await request(
            ceoClient,
            "/api/v1/resources?limit=1&cursor=" + list.value.nextCursor,
          );
          assert.equal(next.value.items.length, 1);
          assert(list.value.items[0].id !== next.value.items[0].id);
          const detail = await request(ceoClient, "/api/v1/resources/" + financial.id);
          assert.equal(detail.status, 200);
          assert.equal(detail.value.permissions.download, false);
          assert.equal(
            (await request(ceoClient, "/api/v1/resources/" + restricted.id)).status,
            404,
          );
          assert.equal(
            (await request(adminClient, "/api/v1/roles/" + assigned.value.id, "DELETE")).status,
            200,
          );
          assert.equal((await request(ceoClient, "/api/v1/resources")).value.total, 0);
        },
      );
      await t.test(
        "department sharing follows current membership; ended/future memberships do not grant access",
        async () => {
          const granted = await request(
            financeClient,
            "/api/v1/resources/" + financial.id + "/grants",
            "POST",
            { departmentId: department("IT"), permission: "view" },
          );
          assert.equal(granted.status, 201);
          assert.equal((await request(itClient, "/api/v1/resources")).value.total, 1);
          const membership = await db.departmentMembership.findFirstOrThrow({
            where: { userId: it.id, effectiveTo: null },
          });
          assert.equal(
            (await request(adminClient, "/api/v1/memberships/" + membership.id, "DELETE")).status,
            200,
          );
          assert.equal((await request(itClient, "/api/v1/resources")).value.total, 0);
          assert.equal(
            (
              await request(adminClient, "/api/v1/memberships", "POST", {
                userId: it.id,
                departmentId: department("IT"),
                effectiveFrom: new Date(Date.now() + 86400000).toISOString(),
              })
            ).status,
            201,
          );
          assert.equal((await request(itClient, "/api/v1/resources")).value.total, 0);
        },
      );
      await t.test(
        "new users enter immediately; optional password changes rotate and invalidate sessions",
        async () => {
          const result = await request(adminClient, "/api/v1/users", "POST", {
            username: "new_employee",
            displayName: "New Employee",
          });
          assert.equal(result.status, 201);
          assert(!JSON.stringify(result.value.user).includes("passwordHash"));
          const employee = await login("new_employee", result.value.temporaryPassword);
          const oldCookie = employee.cookie;
          assert.equal(
            (await request(employee, "/api/v1/me")).value.user.mustChangePassword,
            false,
          );
          assert.equal((await request(employee, "/api/v1/organization")).status, 200);
          assert.equal(
            (
              await request(employee, "/auth/change-password", "POST", {
                currentPassword: result.value.temporaryPassword,
                newPassword: "12345",
              })
            ).status,
            400,
            "five-character passwords must be rejected",
          );
          const newPassword = randomSecret().slice(0, 6);
          const changed = await request(employee, "/auth/change-password", "POST", {
            currentPassword: result.value.temporaryPassword,
            newPassword,
          });
          assert.equal(changed.status, 201);
          await login("new_employee", newPassword);
          assert.equal(changed.value.user.mustChangePassword, false);
          assert(employee.cookie !== oldCookie);
          assert.equal(
            (await request({ cookie: oldCookie, csrf: employee.csrf }, "/api/v1/me")).status,
            401,
          );
          assert.equal(
            (
              await request(client(), "/auth/login", "POST", {
                username: "new_employee",
                password: result.value.temporaryPassword,
              })
            ).status,
            401,
          );
          assert.equal((await request(employee, "/api/v1/organization")).status, 200);
          assert.equal(
            (
              await request(
                adminClient,
                "/api/v1/users/" + result.value.user.id + "/reset-password",
                "POST",
              )
            ).status,
            201,
          );
          assert.equal((await request(employee, "/api/v1/me")).status, 401);
        },
      );
      await t.test(
        "account disablement invalidates an existing session and prevents login",
        async () => {
          assert.equal(
            (
              await request(adminClient, "/api/v1/users/" + office.id, "PATCH", {
                status: "disabled",
              })
            ).status,
            200,
          );
          assert.equal((await request(officeClient, "/api/v1/me")).status, 401);
          assert.equal(
            (await request(client(), "/auth/login", "POST", { username: "office", password }))
              .status,
            401,
          );
        },
      );
      await t.test("idle expiration and logout invalidate sessions", async () => {
        const c = await login("finance");
        const token = c.cookie.split("=")[1];
        await db.session.update({
          where: { tokenHash: secretHash(token) },
          data: { idleExpiresAt: new Date(Date.now() - 1000) },
        });
        assert.equal((await request(c, "/api/v1/me")).status, 401);
        const active = await login("finance");
        assert.equal((await request(active, "/auth/logout", "POST")).status, 201);
        assert.equal((await request(active, "/api/v1/me")).status, 401);
      });
      await t.test(
        "the final active administrator cannot be disabled or lose its role",
        async () => {
          assert.equal(
            (
              await request(adminClient, "/api/v1/users/" + admin.id, "PATCH", {
                status: "disabled",
              })
            ).status,
            409,
          );
          const role = await db.roleAssignment.findFirstOrThrow({
            where: { userId: admin.id, role: "portal_admin" },
          });
          assert.equal(
            (await request(adminClient, "/api/v1/roles/" + role.id, "DELETE")).status,
            409,
          );
        },
      );
      await t.test("repeated failed login is throttled in shared database state", async () => {
        const c = client();
        for (let index = 0; index < 10; index++)
          assert.equal(
            (
              await request(c, "/auth/login", "POST", {
                username: "unknown_throttle",
                password: "incorrect-password",
              })
            ).status,
            401,
          );
        assert.equal(
          (
            await request(c, "/auth/login", "POST", {
              username: "unknown_throttle",
              password: "incorrect-password",
            })
          ).status,
          429,
        );
      });
      await t.test(
        "audit events record sensitive changes and contain no credentials; runtime cannot rewrite history",
        async () => {
          const events = await db.auditEvent.findMany();
          assert(events.some((x) => x.action === "resource.shared"));
          assert(events.some((x) => x.action === "role.revoked"));
          assert(events.some((x) => x.action === "user.password_reset"));
          const metadata = JSON.stringify(events.map((x) => x.metadata));
          assert(!metadata.includes("passwordHash"));
          assert(!metadata.includes("temporaryPassword"));
          assert(!metadata.includes(password));
          await assert.rejects(db.$executeRaw`UPDATE audit_events SET action='tampered'`);
          await assert.rejects(db.$executeRaw`DELETE FROM audit_events`);
        },
      );
    } finally {
      await app.close();
      await db.$disconnect();
    }
  },
);
