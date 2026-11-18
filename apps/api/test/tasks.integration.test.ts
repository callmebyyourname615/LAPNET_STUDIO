import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import { createDatabase } from "@lapnet/database";
import { createApplication } from "../src/app";
import { hashPassword, randomSecret } from "../src/identity/password";
import { taskSchema, taskPageSchema, taskHistorySchema, dashboardSchema } from "@lapnet/contracts";

test("Phase 03A persistent tasks", { skip: !process.env.TEST_IDENTITY_DATABASE_URL }, async (t) => {
  const connection = process.env.TEST_IDENTITY_DATABASE_URL!;
  const url = new URL(connection);
  assert(
    url.hostname === "127.0.0.1" &&
      url.port === "55432" &&
      /^\/lapnet_identity_[0-9a-f]+$/.test(url.pathname),
  );
  process.env.DATABASE_URL = connection;
  process.env.APP_ORIGIN = "http://127.0.0.1:5173";
  const db = createDatabase(connection),
    password = randomSecret().slice(0, 24),
    passwordHash = await hashPassword(password);
  const users = await Promise.all(
    ["task_finance", "task_it", "task_outsider", "task_admin"].map((username) =>
      db.user.create({
        data: {
          username,
          identitySubject: username,
          displayName: username,
          passwordHash,
          mustChangePassword: false,
        },
      }),
    ),
  );
  const [finance, it, outsider, admin] = users;
  const departments = await db.department.findMany();
  const department = (code: string) => departments.find((d) => d.code === code)!.id;
  await db.departmentMembership.createMany({
    data: [
      { userId: finance.id, departmentId: department("FINANCE") },
      { userId: it.id, departmentId: department("IT") },
      { userId: outsider.id, departmentId: department("AUDIT") },
    ],
  });
  await db.roleAssignment.create({
    data: { userId: admin.id, role: "portal_admin", grantedById: admin.id },
  });
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
    if (typeof value.csrfToken === "string") c.csrf = value.csrfToken;
    return { status: response.status, value };
  }
  async function login(username: string) {
    const c = { cookie: "", csrf: "" };
    assert.equal((await request(c, "/auth/login", "POST", { username, password })).status, 201);
    return c;
  }
  const base = {
    title: "ຕິດຕາມວຽກ Finance",
    description: "<script>window.pwned=true</script>",
    priority: "high",
    dueDate: "2026-11-08",
    assigneeId: finance.id,
    collaboratorIds: [],
    shareParticipants: false,
    departmentId: department("FINANCE"),
  };
  let id = "",
    revision = 1;
  const fc = await login(finance.username!),
    ic = await login(it.username!),
    oc = await login(outsider.username!),
    ac = await login(admin.username!);
  const fields = (value: Record<string, unknown> = {}) => ({
    title: base.title,
    description: base.description,
    priority: base.priority,
    dueDate: base.dueDate,
    assigneeId: finance.id,
    collaboratorIds: [],
    shareParticipants: false,
    revision,
    ...value,
  });
  try {
    await t.test("authentication, CSRF and owning department are enforced", async () => {
      assert.equal((await request({ cookie: "", csrf: "" }, "/api/v1/tasks")).status, 401);
      assert.equal((await request(fc, "/api/v1/tasks", "POST", base, false)).status, 403);
      assert.equal(
        (await request(fc, "/api/v1/tasks", "POST", { ...base, departmentId: department("AUDIT") }))
          .status,
        403,
      );
      assert.equal((await request(ac, "/api/v1/tasks", "POST", base)).status, 403);
    });
    await t.test(
      "strict dates, duplicate participants, unknown fields and whitespace titles are rejected",
      async () => {
        for (const invalid of [
          { dueDate: "2026-02-30" },
          { title: "  " },
          { priority: "root" },
          { ownerUserId: outsider.id },
          { collaboratorIds: [it.id, it.id] },
          { assigneeId: null },
        ])
          assert.equal(
            (await request(fc, "/api/v1/tasks", "POST", { ...base, ...invalid })).status,
            400,
          );
        assert.equal(
          (await request(fc, "/api/v1/tasks", "POST", { ...base, collaboratorIds: [finance.id] }))
            .status,
          400,
        );
        assert.equal(await db.task.count(), 0, "failed creation rolls back task and resource");
      },
    );
    await t.test("create returns a persistent typed record and authorized history", async () => {
      const created = await request(fc, "/api/v1/tasks", "POST", base);
      assert.equal(created.status, 201);
      const task = taskSchema.parse(created.value);
      id = task.id;
      assert.equal(task.revision, 1);
      assert.equal(task.assignee.id, finance.id);
      assert.equal(task.overdue, true);
      assert.equal(task.description, base.description);
      assert.equal((await request(fc, "/api/v1/tasks/" + id)).value.id, id);
      const history = taskHistorySchema.parse(
        (await request(fc, `/api/v1/tasks/${id}/history`)).value,
      );
      assert.equal(history.items[0].snapshot.title, base.title);
    });
    await t.test(
      "dashboard aggregates match authorized lists without disclosing hidden work",
      async () => {
        for (const client of [fc, ic, oc, ac]) {
          const summary = dashboardSchema.parse(
            (await request(client, "/api/v1/tasks/dashboard?view=all&days=14")).value,
          );
          const list = taskPageSchema.parse((await request(client, "/api/v1/tasks")).value);
          assert.equal(summary.totals.total, list.total);
          assert.equal(
            summary.statuses.reduce((n, row) => n + row.count, 0),
            list.total,
          );
          assert.equal(
            summary.totals.active,
            list.items.filter((row) => !["done", "cancelled"].includes(row.status)).length,
          );
          assert.equal(summary.trend.length, 14);
          assert(summary.recent.every((row) => list.items.some((item) => item.id === row.id)));
          if (client !== fc) {
            assert.equal(summary.totals.overdue, 0);
            assert.deepEqual(summary.upcoming, []);
            assert(summary.trend.every((row) => row.created === 0 && row.completed === 0));
          }
        }
        const mine = dashboardSchema.parse(
          (await request(fc, "/api/v1/tasks/dashboard?view=mine&days=30")).value,
        );
        assert.equal(mine.totals.total, 1);
        assert.equal(mine.trend.length, 30);
        assert.equal(
          mine.trend.reduce((n, row) => n + row.created, 0),
          1,
        );
        assert.equal((await request(fc, "/api/v1/tasks/dashboard?days=365")).status, 400);
        assert.equal((await request(fc, "/api/v1/tasks/dashboard?view=unknown")).status, 400);
        assert.equal(
          (await request({ cookie: "", csrf: "" }, "/api/v1/tasks/dashboard")).status,
          401,
        );
      },
    );
    await t.test(
      "lists, counts, detail and history cannot leak to other departments or administrators",
      async () => {
        for (const c of [ic, oc, ac]) {
          const page = taskPageSchema.parse((await request(c, "/api/v1/tasks")).value);
          assert.equal(page.total, 0);
          assert.equal(page.items.length, 0);
          assert.equal((await request(c, "/api/v1/tasks/" + id)).status, 404);
          assert.equal((await request(c, `/api/v1/tasks/${id}/history`)).status, 404);
          assert.equal((await request(c, "/api/v1/tasks/" + id, "PATCH", fields())).status, 404);
        }
      },
    );
    await t.test(
      "Host-selected participants receive explicit grants automatically; only Host manages the team",
      async () => {
        const update = await request(
          fc,
          "/api/v1/tasks/" + id,
          "PATCH",
          fields({ collaboratorIds: [it.id] }),
        );
        assert.equal(update.status, 200);
        revision = update.value.revision;
        assert.equal(update.value.collaborators[0].id, it.id);
        assert.equal((await request(ic, "/api/v1/tasks/" + id)).value.permissions.edit, true);
        assert.equal((await request(ic, "/api/v1/tasks?view=mine")).value.total, 1);
        assert.equal((await request(fc, "/api/v1/tasks?view=created")).value.total, 1);
        assert.equal((await request(oc, "/api/v1/tasks?view=team")).value.total, 0);
        assert.equal(
          (await request(ic, "/api/v1/tasks/" + id, "PATCH", fields({ shareParticipants: true })))
            .status,
          403,
        );
        const transferred = await request(
          fc,
          "/api/v1/tasks/" + id,
          "PATCH",
          fields({ assigneeId: it.id, collaboratorIds: [finance.id] }),
        );
        assert.equal(transferred.status, 200);
        revision = transferred.value.revision;
        assert.equal(transferred.value.assignee.id, it.id);
        assert.equal(transferred.value.owner.id, finance.id);
      },
    );
    await t.test(
      "simultaneous edits return one conflict and exactly one history revision",
      async () => {
        const before = await db.taskRevision.count({ where: { taskId: id } });
        const results = await Promise.all([
          request(
            fc,
            "/api/v1/tasks/" + id,
            "PATCH",
            fields({ title: "first edit", assigneeId: it.id }),
          ),
          request(
            fc,
            "/api/v1/tasks/" + id,
            "PATCH",
            fields({ title: "second edit", assigneeId: it.id }),
          ),
        ]);
        assert.deepEqual(results.map((x) => x.status).sort(), [200, 409]);
        revision = results.find((x) => x.status === 200)!.value.revision;
        assert.equal(await db.taskRevision.count({ where: { taskId: id } }), before + 1);
      },
    );
    await t.test(
      "transitions, required reasons, reopen and due-date semantics preserve history",
      async () => {
        assert.equal(
          (
            await request(ic, `/api/v1/tasks/${id}/transitions`, "POST", {
              revision,
              status: "blocked",
            })
          ).status,
          400,
        );
        const blocked = await request(ic, `/api/v1/tasks/${id}/transitions`, "POST", {
          revision,
          status: "blocked",
          reason: "Waiting for Finance",
        });
        assert.equal(blocked.status, 201);
        revision = blocked.value.revision;
        const done = await request(ic, `/api/v1/tasks/${id}/transitions`, "POST", {
          revision,
          status: "done",
        });
        assert.equal(done.status, 201);
        revision = done.value.revision;
        assert.equal(done.value.overdue, false);
        assert.equal(
          (
            await request(ic, `/api/v1/tasks/${id}/transitions`, "POST", {
              revision,
              status: "in_progress",
              reason: "reopen",
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await request(ic, `/api/v1/tasks/${id}/transitions`, "POST", {
              revision,
              status: "todo",
            })
          ).status,
          400,
        );
        const reopened = await request(ic, `/api/v1/tasks/${id}/transitions`, "POST", {
          revision,
          status: "todo",
          reason: "More evidence needed",
        });
        assert.equal(reopened.status, 201);
        revision = reopened.value.revision;
        const history = taskHistorySchema.parse(
          (await request(fc, `/api/v1/tasks/${id}/history?limit=2`)).value,
        );
        assert.equal(history.items[0].action, "reopened");
        assert(history.nextBefore);
        const older = taskHistorySchema.parse(
          (await request(fc, `/api/v1/tasks/${id}/history?limit=2&before=${history.nextBefore}`))
            .value,
        );
        assert(older.items.every((x) => x.revision < history.nextBefore!));
      },
    );
    await t.test(
      "search, filters and cursor pagination are bounded and stable when tasks arrive",
      async () => {
        const newer = await request(fc, "/api/v1/tasks", "POST", {
          ...base,
          title: "newer",
          dueDate: null,
        });
        assert.equal(newer.status, 201);
        const first = taskPageSchema.parse((await request(fc, "/api/v1/tasks?limit=1")).value);
        assert(first.nextCursor);
        await request(fc, "/api/v1/tasks", "POST", { ...base, title: "newest" });
        const second = taskPageSchema.parse(
          (await request(fc, "/api/v1/tasks?limit=1&cursor=" + first.nextCursor)).value,
        );
        assert.equal(second.items[0].id, id);
        assert.equal((await request(fc, "/api/v1/tasks?status=done")).value.total, 0);
        assert.equal((await request(fc, "/api/v1/tasks?priority=high&due=overdue")).value.total, 2);
        assert.equal((await request(fc, "/api/v1/tasks?cursor=bad")).status, 400);
        assert.equal((await request(fc, "/api/v1/tasks?limit=1000")).status, 400);
        assert.equal((await request(fc, "/api/v1/tasks?q=TSK-9999999999999999999")).status, 200);
        assert.equal((await request(fc, "/api/v1/tasks/options?q=task_")).value.users.length, 4);
      },
    );
    await t.test(
      "revoked grants immediately block task detail, edits, history and list counts",
      async () => {
        const grants = await db.resourceGrant.findMany({
          where: { resourceId: id, userId: it.id, revokedAt: null },
        });
        for (const grant of grants)
          assert.equal(
            (await request(fc, `/api/v1/resources/${id}/grants/${grant.id}`, "DELETE")).status,
            200,
          );
        assert.equal((await request(ic, "/api/v1/tasks/" + id)).status, 404);
        assert.equal((await request(ic, `/api/v1/tasks/${id}/history`)).status, 404);
        assert.equal((await request(ic, "/api/v1/tasks?view=mine")).value.total, 0);
        assert.equal(
          (
            await request(ic, `/api/v1/tasks/${id}/transitions`, "POST", {
              revision,
              status: "done",
            })
          ).status,
          404,
        );
      },
    );
    await t.test(
      "scoped viewer/editor roles apply to tasks without granting share or archive",
      async () => {
        const viewer = await request(ac, "/api/v1/roles", "POST", {
          userId: outsider.id,
          role: "resource_viewer",
          departmentId: department("FINANCE"),
        });
        assert.equal(viewer.status, 201);
        assert.equal((await request(oc, "/api/v1/tasks")).value.total, 3);
        assert.equal((await request(oc, "/api/v1/tasks/" + id, "PATCH", fields())).status, 403);
        assert.equal((await request(ac, "/api/v1/roles/" + viewer.value.id, "DELETE")).status, 200);
        assert.equal((await request(oc, "/api/v1/tasks")).value.total, 0);
        const editor = await request(ac, "/api/v1/roles", "POST", {
          userId: outsider.id,
          role: "resource_editor",
          departmentId: department("FINANCE"),
        });
        assert.equal(editor.status, 201);
        const updated = await request(
          oc,
          "/api/v1/tasks/" + id,
          "PATCH",
          fields({ title: "Scoped editor change", assigneeId: it.id }),
        );
        assert.equal(updated.status, 200);
        assert.equal(updated.value.assignedBy.id, finance.id);
        assert.equal((await request(oc, "/api/v1/tasks?view=assigned")).value.total, 0);
        const metadataOnly = await request(
          fc,
          "/api/v1/tasks/" + id,
          "PATCH",
          fields({
            revision: updated.value.revision,
            title: "Owner updates metadata",
            assigneeId: it.id,
          }),
        );
        assert.equal(metadataOnly.status, 200);
        assert.equal(metadataOnly.value.assignedBy.id, finance.id);

        revision = metadataOnly.value.revision;
        assert.equal(
          (await request(oc, `/api/v1/tasks/${id}/archive`, "POST", { revision })).status,
          403,
        );
        assert.equal(
          (await request(oc, "/api/v1/tasks/" + id, "PATCH", fields({ shareParticipants: true })))
            .status,
          403,
        );
        assert.equal((await request(ac, "/api/v1/roles/" + editor.value.id, "DELETE")).status, 200);
        assert.equal((await request(oc, "/api/v1/tasks/" + id)).status, 404);
      },
    );
    await t.test(
      "department grants use current membership and do not imply edit permission",
      async () => {
        const grant = await request(fc, `/api/v1/resources/${id}/grants`, "POST", {
          departmentId: department("IT"),
          permission: "view",
        });
        assert.equal(grant.status, 201);
        assert.equal((await request(ic, "/api/v1/tasks/" + id)).value.permissions.edit, false);
        assert.equal((await request(ic, "/api/v1/tasks/" + id, "PATCH", fields())).status, 403);
        await db.departmentMembership.updateMany({
          where: { userId: it.id },
          data: { effectiveTo: new Date() },
        });
        assert.equal((await request(ic, "/api/v1/tasks/" + id)).status, 404);
        assert.equal((await request(ic, "/api/v1/tasks")).value.total, 0);
        await db.departmentMembership.updateMany({
          where: { userId: it.id },
          data: { effectiveTo: null },
        });
        assert.equal((await request(ic, "/api/v1/tasks/" + id)).status, 200);
        assert.equal(
          (await request(fc, `/api/v1/resources/${id}/grants/${grant.value.id}`, "DELETE")).status,
          200,
        );
        assert.equal((await request(ic, "/api/v1/tasks/" + id)).status, 404);
      },
    );
    await t.test(
      "runtime cannot modify or delete business history and technical audit omits content",
      async () => {
        await assert.rejects(db.$executeRaw`DELETE FROM task_revisions WHERE task_id=${id}::uuid`);
        await assert.rejects(
          db.$executeRaw`UPDATE task_revisions SET action='forged' WHERE task_id=${id}::uuid`,
        );
        const audits = await db.auditEvent.findMany({ where: { targetId: id } });
        assert(audits.length > 0);
        assert(!JSON.stringify(audits).includes(base.description));
      },
    );
    await t.test("task, history and opaque session survive an API restart", async () => {
      await app.close();
      app = await createApplication(undefined, false);
      await app.listen(0, "127.0.0.1");
      origin = "http://127.0.0.1:" + (app.getHttpServer().address() as AddressInfo).port;
      const task = taskSchema.parse((await request(fc, "/api/v1/tasks/" + id)).value);
      assert.equal(task.revision, revision);
      assert.equal(
        (await request(fc, `/api/v1/tasks/${id}/history`)).value.items[0].revision,
        revision,
      );
    });
    await t.test(
      "archive is revision checked, owner controlled and retains history without public access",
      async () => {
        assert.equal(
          (await request(fc, `/api/v1/tasks/${id}/archive`, "POST", { revision: 1 })).status,
          409,
        );
        assert.equal(
          (await request(fc, `/api/v1/tasks/${id}/archive`, "POST", { revision })).status,
          201,
        );
        assert.equal((await request(fc, "/api/v1/tasks/" + id)).status, 404);
        assert.equal((await request(fc, `/api/v1/tasks/${id}/history`)).status, 404);
        assert.equal(
          (
            await db.taskRevision.findFirstOrThrow({
              where: { taskId: id },
              orderBy: { revision: "desc" },
            })
          ).action,
          "archived",
        );
      },
    );
  } finally {
    await app.close();
    await db.$disconnect();
  }
});
