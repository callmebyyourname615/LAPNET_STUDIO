import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import { createDatabase } from "@lapnet/database";
import { notificationsSchema } from "@lapnet/contracts";
import { createApplication } from "../src/app";
import { hashPassword, randomSecret } from "../src/identity/password";
import { WorkerService } from "../src/business/worker.service";

test(
  "Notification inbox, actors and read state",
  { skip: !process.env.TEST_IDENTITY_DATABASE_URL },
  async (t) => {
    const connection = process.env.TEST_IDENTITY_DATABASE_URL!,
      url = new URL(connection);
    assert(
      url.hostname === "127.0.0.1" &&
        url.port === "55432" &&
        /^\/lapnet_identity_[a-f0-9]+$/.test(url.pathname),
    );
    Object.assign(process.env, {
      DATABASE_URL: connection,
      APP_ORIGIN: "http://127.0.0.1:5173",
      PORTAL_WORKER: "0",
    });
    const db = createDatabase(connection),
      password = randomSecret().slice(0, 24),
      passwordHash = await hashPassword(password);
    const people = [];
    for (const username of ["notification_host", "notification_member", "notification_outsider"])
      people.push(
        await db.user.create({
          data: {
            username,
            identitySubject: username,
            displayName: username,
            passwordHash,
            mustChangePassword: false,
          },
        }),
      );
    const [host, member] = people;
    const finance = await db.department.findUniqueOrThrow({ where: { code: "FINANCE" } });
    await db.departmentMembership.create({ data: { userId: host.id, departmentId: finance.id } });
    const app = await createApplication(undefined, false);
    await app.listen(0, "127.0.0.1");
    const origin = "http://127.0.0.1:" + (app.getHttpServer().address() as AddressInfo).port;
    type Client = { cookie: string; csrf: string };
    async function request(
      client: Client,
      path: string,
      method = "GET",
      body?: unknown,
      csrf = true,
    ) {
      const response = await fetch(origin + path, {
        method,
        headers: {
          origin: process.env.APP_ORIGIN!,
          cookie: client.cookie,
          ...(csrf ? { "x-csrf-token": client.csrf } : {}),
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const cookie = response.headers.get("set-cookie");
      if (cookie) client.cookie = cookie.split(";")[0];
      const value = await response.json();
      if (value.csrfToken) client.csrf = value.csrfToken;
      return { status: response.status, value };
    }
    const clients: Client[] = [];
    for (const user of people) {
      const client = { cookie: "", csrf: "" };
      assert.equal(
        (await request(client, "/auth/login", "POST", { username: user.username, password }))
          .status,
        201,
      );
      clients.push(client);
    }
    const [hc, mc, oc] = clients;
    const base = "/api/v1/notifications";
    let taskId = "",
      commentId = "",
      memberNotification = "";
    try {
      await t.test(
        "Worker persists real actor references without copying private comment text",
        async () => {
          const task = await request(hc, "/api/v1/tasks", "POST", {
            title: "Private shared work",
            description: "",
            priority: "normal",
            departmentId: finance.id,
            assigneeId: member.id,
            collaboratorIds: [],
          });
          assert.equal(task.status, 201);
          taskId = task.value.id;
          const comment = await request(hc, `/api/v1/resources/${taskId}/comments`, "POST", {
            text: "Please review the attached draft",
            mentions: [{ type: "user", id: member.id }],
          });
          assert.equal(comment.status, 201);
          commentId = comment.value.id;
          const worker = app.get(WorkerService);
          while (await worker.one()) {
            /* drain disposable queue */
          }
          const jobs = await db.outboxJob.findMany({ where: { recipientId: member.id } });
          assert(jobs.every((job) => (job.payload as { actorId?: string }).actorId === host.id));
          assert(!JSON.stringify(jobs).includes("Please review the attached draft"));
          const response = notificationsSchema.parse((await request(mc, base)).value);
          assert.equal(response.total, 3);
          assert.equal(response.unread, 3);
          const item = response.items.find((item) => item.kind === "comment")!;
          memberNotification = item.id;
          assert.equal(item.actor?.id, host.id);
          assert.equal(item.actor?.department, finance.name);
          assert.equal(item.excerpt, "Please review the attached draft");
          assert.equal(item.resourceKind, "task");
          assert.match(item.code!, /^TSK-/);
          assert.equal(
            response.counts.reduce((sum, item) => sum + item.count, 0),
            response.total,
          );
        },
      );
      await t.test("Server filters and cursor pagination retain real global counts", async () => {
        for (const [view, count] of [
          ["unread", 3],
          ["mentions", 1],
          ["tasks", 1],
          ["comments", 1],
        ] as const) {
          const page = notificationsSchema.parse((await request(mc, base + "?view=" + view)).value);
          assert.equal(page.items.length, count);
          assert.equal(page.total, 3);
        }
        const first = notificationsSchema.parse((await request(mc, base + "?limit=1")).value);
        assert(first.nextCursor);
        const next = notificationsSchema.parse(
          (await request(mc, base + "?limit=1&cursor=" + first.nextCursor)).value,
        );
        assert.notEqual(next.items[0].id, first.items[0].id);
        for (const query of [
          "?view=archive",
          "?limit=1000",
          "?cursor=bad",
          "?recipientId=" + host.id,
        ])
          assert.equal((await request(mc, base + query)).status, 400);
      });
      await t.test(
        "Single/read-all mutations require CSRF and cannot mark another user's inbox",
        async () => {
          assert.equal((await request({ cookie: "", csrf: "" }, base)).status, 401);
          assert.equal(
            (await request(oc, `${base}/${memberNotification}/read`, "POST")).status,
            404,
          );
          assert.equal(
            (await request(mc, `${base}/read-all`, "POST", undefined, false)).status,
            403,
          );
          assert.equal(
            (await request(mc, `${base}/${memberNotification}/read`, "POST")).status,
            201,
          );
          assert.equal((await request(mc, base + "?view=unread")).value.items.length, 2);
          assert.equal((await request(oc, `${base}/read-all`, "POST")).value.count, 0);
          assert.equal((await request(mc, `${base}/read-all`, "POST")).value.count, 2);
          assert.equal((await request(mc, `${base}/read-all`, "POST")).value.count, 0);
          assert.equal((await request(mc, base)).value.unread, 0);
          assert.equal((await request(mc, base)).value.items.length, 3);
        },
      );
      await t.test(
        "Legacy actors resolve from task/comment keys; archived excerpts disappear",
        async () => {
          await db.outboxJob.updateMany({
            where: { recipientId: member.id },
            data: { payload: { notificationKind: "comment" } },
          });
          let response = notificationsSchema.parse((await request(mc, base)).value);
          assert(response.items.every((item) => item.actor?.id === host.id));
          assert.equal(
            (
              await request(
                hc,
                `/api/v1/resources/${taskId}/comments/${commentId}/archive`,
                "POST",
                { text: "Please review the attached draft", revision: 1 },
              )
            ).status,
            201,
          );
          response = notificationsSchema.parse((await request(mc, base)).value);
          assert(response.items.every((item) => item.excerpt === null));
        },
      );
      await t.test(
        "Malformed legacy event keys cannot break the inbox or invent metadata",
        async () => {
          const rows: { id: string }[] = [];
          for (const key of [
            `comment:${"-".repeat(36)}:1:${member.id}`,
            `task:${taskId}:999999999999999999999:${member.id}`,
          ])
            rows.push(
              await db.notification.create({
                data: { key, kind: "comment", resourceId: taskId, recipientId: member.id },
              }),
            );
          const response = await request(mc, base);
          assert.equal(response.status, 200);
          const items = notificationsSchema
            .parse(response.value)
            .items.filter((item) => rows.some((row) => row.id === item.id));
          assert.equal(items.length, 2);
          assert(items.every((item) => item.actor === null && item.excerpt === null));
        },
      );
      await t.test(
        "Revoked resources vanish from rows, metadata, counts and read mutations",
        async () => {
          await db.resourceGrant.updateMany({
            where: { resourceId: taskId, userId: member.id },
            data: { revokedAt: new Date() },
          });
          const response = notificationsSchema.parse((await request(mc, base)).value);
          assert.deepEqual(response.items, []);
          assert.equal(response.total, 0);
          assert.equal(response.unread, 0);
          assert.deepEqual(response.counts, []);
          assert.equal(
            (await request(mc, `${base}/${memberNotification}/read`, "POST")).status,
            404,
          );
          assert.equal((await request(mc, `${base}/read-all`, "POST")).value.count, 0);
          assert(!JSON.stringify(response).includes(host.displayName));
        },
      );
    } finally {
      await app.close();
      await db.$disconnect();
    }
  },
);
