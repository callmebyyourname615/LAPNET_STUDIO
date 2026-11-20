import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import { createDatabase } from "@lapnet/database";
import { createApplication } from "../src/app";
import { hashPassword, randomSecret } from "../src/identity/password";
import { taskSchema, taskPageSchema, commentsSchema, taskOptionsSchema } from "@lapnet/contracts";
import sharp from "sharp";

test("Host and shared task team", { skip: !process.env.TEST_IDENTITY_DATABASE_URL }, async (t) => {
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
    password = randomSecret().slice(0, 24);
  const passwordHash = await hashPassword(password);
  const people = [];
  for (const username of [
    "team_host",
    "team_person",
    "team_department",
    "team_new",
    "team_outsider",
  ])
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
  const [host, person, member, invited, outsider] = people;
  const departments = await db.department.findMany();
  const department = (code: string) => departments.find((row) => row.code === code)!.id;
  await db.departmentMembership.createMany({
    data: [
      { userId: host.id, departmentId: department("FINANCE") },
      { userId: member.id, departmentId: department("IT") },
      { userId: outsider.id, departmentId: department("AUDIT") },
    ],
  });
  let app = await createApplication(undefined, false);
  await app.listen(0, "127.0.0.1");
  let origin = "http://127.0.0.1:" + (app.getHttpServer().address() as AddressInfo).port;
  type Client = { cookie: string; csrf: string };
  async function request(client: Client, path: string, method = "GET", body?: unknown) {
    const response = await fetch(origin + path, {
      method,
      headers: {
        origin: process.env.APP_ORIGIN!,
        cookie: client.cookie,
        "x-csrf-token": client.csrf,
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
      (await request(client, "/auth/login", "POST", { username: user.username, password })).status,
      201,
    );
    clients.push(client);
  }
  const [hc, pc, mc, nc, oc] = clients;
  const fields = {
    title: "Shared team work",
    description: "Private progress",
    priority: "normal",
    dueDate: null,
    assigneeId: person.id,
    collaboratorIds: [] as string[],
    taggedDepartmentIds: [department("IT")],
  };
  let id = "",
    revision = 1,
    avatarPath = "";
  try {
    await t.test(
      "Assignment directory browses, searches single characters and filters current divisions",
      async () => {
        const disabled = await db.user.create({
          data: {
            username: "disabled_assignment",
            identitySubject: "disabled_assignment",
            displayName: "Disabled assignment",
            status: "disabled",
            passwordHash,
          },
        });
        await db.departmentMembership.create({
          data: {
            userId: person.id,
            departmentId: department("IT"),
            effectiveFrom: new Date(Date.now() + 86400000),
          },
        });
        const first = taskOptionsSchema.parse(
          (await request(hc, "/api/v1/tasks/options?limit=2")).value,
        );
        assert.equal(first.users.length, 2);
        assert(first.nextCursor);
        const second = taskOptionsSchema.parse(
          (await request(hc, "/api/v1/tasks/options?limit=2&cursor=" + first.nextCursor)).value,
        );
        assert(!second.users.some((user) => first.users.some((before) => before.id === user.id)));
        const searched = taskOptionsSchema.parse(
          (await request(hc, "/api/v1/tasks/options?q=t")).value,
        );
        assert(searched.users.some((user) => user.id === person.id));
        assert(!searched.users.some((user) => user.id === disabled.id));
        assert.equal(searched.users.find((user) => user.id === host.id)!.username, host.username);
        const filtered = taskOptionsSchema.parse(
          (await request(hc, "/api/v1/tasks/options?departmentId=" + department("IT"))).value,
        );
        assert.deepEqual(
          filtered.users.map((user) => user.id),
          [member.id],
        );
        assert.equal(filtered.users[0].departments[0].code, "IT");
        assert.equal((await request(hc, "/api/v1/tasks/options?departmentId=invalid")).status, 400);
        assert.equal((await request(hc, "/api/v1/tasks/options?cursor=invalid")).status, 400);
      },
    );
    await t.test(
      "Host selects people and departments without a separate consent flag",
      async () => {
        const response = await request(hc, "/api/v1/tasks", "POST", {
          ...fields,
          departmentId: department("FINANCE"),
        });
        assert.equal(response.status, 201);
        const row = taskSchema.parse(response.value);
        id = row.id;
        revision = row.revision;
        assert.equal(row.owner.id, host.id);
        assert.equal(row.permissions.manageTeam, true);
        assert.equal(row.taggedDepartments[0].id, department("IT"));
        for (const client of [pc, mc]) {
          const detail = taskSchema.parse((await request(client, `/api/v1/tasks/${id}`)).value);
          assert.equal(detail.permissions.edit, true);
          assert.equal(detail.permissions.comment, true);
          assert.equal(detail.permissions.manageTeam, false);
          assert.equal(detail.permissions.manageAccess, false);
          assert.equal(
            taskPageSchema.parse((await request(client, "/api/v1/tasks?view=mine")).value).items[0]
              .id,
            id,
          );
        }
        for (const client of [nc, oc])
          assert.equal((await request(client, `/api/v1/tasks/${id}`)).status, 404);
        assert.equal((await request(oc, `/api/v1/tasks/options?taskId=${id}`)).status, 404);
        assert.equal(
          await db.resourceGrant.count({
            where: { resourceId: id, source: "task_team", revokedAt: null },
          }),
          6,
        );
      },
    );
    await t.test(
      "Scoped @ lookup returns people on the first character and checks task access",
      async () => {
        const path = `/api/v1/mention-targets?resourceId=${id}`;
        const result = await request(pc, path);
        assert.equal(result.status, 200);
        assert(result.value.users.some((user: { id: string }) => user.id === host.id));
        assert(result.value.departments.some((row: { id: string }) => row.id === department("IT")));
        assert.equal((await request(oc, path)).status, 404);
        assert.equal((await request(pc, "/api/v1/mention-targets?resourceId=invalid")).status, 400);
        assert.deepEqual((await request(pc, "/api/v1/mention-targets")).value.users, []);
      },
    );
    await t.test(
      "Task comment viewers see the author profile without access to private account fields",
      async () => {
        const image = await sharp({
          create: { width: 32, height: 32, channels: 3, background: "#836bc5" },
        })
          .png()
          .toBuffer();
        const upload = await fetch(origin + "/api/v1/me/images/avatar", {
          method: "PUT",
          headers: {
            origin: process.env.APP_ORIGIN!,
            cookie: hc.cookie,
            "x-csrf-token": hc.csrf,
            "content-type": "application/octet-stream",
          },
          body: new Uint8Array(image),
        });
        assert.equal(upload.status, 200);
        await upload.arrayBuffer();
        const posted = await request(hc, `/api/v1/resources/${id}/comments`, "POST", {
          text: "Host with avatar",
          mentions: [],
        });
        assert.equal(posted.status, 201);
        const comments = commentsSchema.parse(
          (await request(pc, `/api/v1/resources/${id}/comments`)).value,
        );
        avatarPath = comments.items.find((comment) => comment.id === posted.value.id)!.author
          .avatarUrl!;
        assert(
          avatarPath.startsWith(`/api/v1/resources/${id}/comments/${posted.value.id}/avatar?v=`),
        );
        for (const client of [pc, mc]) {
          const imageResponse = await fetch(origin + avatarPath, {
            headers: { cookie: client.cookie },
          });
          assert.equal(imageResponse.status, 200);
          assert.equal(imageResponse.headers.get("content-type"), "image/webp");
          assert.equal(imageResponse.headers.get("cache-control"), "private, no-store");
          assert((await imageResponse.arrayBuffer()).byteLength > 0);
        }
        assert.equal((await request(oc, avatarPath)).status, 404);
        assert.equal(
          (await request(pc, `/api/v1/resources/${id}/comments/${host.id}/avatar`)).status,
          404,
        );
        assert.equal((await request(pc, "/api/v1/me/images/avatar")).status, 404);
        assert.equal(
          (await request(pc, avatarPath.split("?")[0].replace(/avatar$/, "cover"))).status,
          404,
        );
        const coverUpload = await fetch(origin + "/api/v1/me/images/cover", {
          method: "PUT",
          headers: {
            origin: process.env.APP_ORIGIN!,
            cookie: hc.cookie,
            "x-csrf-token": hc.csrf,
            "content-type": "application/octet-stream",
          },
          body: new Uint8Array(image),
        });
        assert.equal(coverUpload.status, 200);
        await coverUpload.arrayBuffer();
        const profilePath = `/api/v1/resources/${id}/comments/${posted.value.id}/profile`;
        const profile = await request(pc, profilePath);
        assert.equal(profile.status, 200);
        assert.deepEqual(Object.keys(profile.value).sort(), [
          "avatarUrl",
          "coverUrl",
          "departments",
          "displayName",
        ]);
        assert.equal(profile.value.displayName, host.displayName);
        assert.equal(profile.value.avatarUrl, avatarPath);
        const scopedCover = await fetch(origin + profile.value.coverUrl, {
          headers: { cookie: pc.cookie },
        });
        assert.equal(scopedCover.status, 200);
        assert.equal(scopedCover.headers.get("cache-control"), "private, no-store");
        await scopedCover.arrayBuffer();
        assert.equal((await request(oc, profilePath)).status, 404);
        assert.equal((await request(oc, profile.value.coverUrl)).status, 404);
        assert.equal(
          (await request(pc, `/api/v1/resources/${id}/comments/${host.id}/profile`)).status,
          404,
        );
      },
    );
    await t.test("Members post progress and change status; they cannot invite others", async () => {
      const progress = await request(mc, `/api/v1/resources/${id}/comments`, "POST", {
        text: "Ready for review",
        mentions: [],
      });
      assert.equal(progress.status, 201);
      const comments = commentsSchema.parse(
        (await request(pc, `/api/v1/resources/${id}/comments`)).value,
      );
      assert.equal(comments.items[0].author.id, member.id);
      assert.equal(comments.items[0].text, "Ready for review");
      const transition = await request(pc, `/api/v1/tasks/${id}/transitions`, "POST", {
        status: "in_progress",
        revision,
      });
      assert.equal(transition.status, 201);
      revision = transition.value.revision;
      assert.equal(
        (
          await request(mc, `/api/v1/tasks/${id}`, "PATCH", {
            ...fields,
            title: "Progress updated",
            revision,
          })
        ).status,
        200,
      );
      revision++;
      assert.equal(
        (
          await request(mc, `/api/v1/tasks/${id}`, "PATCH", {
            ...fields,
            collaboratorIds: [outsider.id],
            revision,
          })
        ).status,
        403,
      );
      const before = await db.resourceComment.count({ where: { resourceId: id } });
      assert.equal(
        (
          await request(pc, `/api/v1/resources/${id}/comments`, "POST", {
            text: "Unauthorized invitation",
            mentions: [{ type: "user", id: outsider.id }],
          })
        ).status,
        400,
      );
      assert.equal(await db.resourceComment.count({ where: { resourceId: id } }), before);
      assert.equal((await request(oc, `/api/v1/tasks/${id}`)).status, 404);
    });
    await t.test(
      "Host @tag invitation adds real team grants atomically with comment and history",
      async () => {
        const response = await request(hc, `/api/v1/resources/${id}/comments`, "POST", {
          text: "Please join this work",
          mentions: [
            { type: "user", id: invited.id },
            { type: "department", id: department("AUDIT") },
          ],
        });
        assert.equal(response.status, 201);
        for (const client of [nc, oc])
          assert.equal((await request(client, `/api/v1/tasks/${id}`)).value.permissions.edit, true);
        const task = taskSchema.parse((await request(hc, `/api/v1/tasks/${id}`)).value);
        revision = task.revision;
        assert(task.collaborators.some((row) => row.id === invited.id));
        assert(task.taggedDepartments.some((row) => row.id === department("AUDIT")));
        assert.equal(
          (await request(hc, `/api/v1/tasks/${id}/history`)).value.items[0].action,
          "team_invited",
        );
        const progress = await request(pc, `/api/v1/resources/${id}/comments`, "POST", {
          text: "Another update for all departments",
          mentions: [],
        });
        assert.equal(progress.status, 201);
        assert(
          await db.outboxJob.findFirst({
            where: {
              key: { startsWith: `comment:${progress.value.id}:` },
              recipientId: outsider.id,
            },
          }),
        );
      },
    );
    await t.test(
      "Ending group membership immediately removes access; manual grants survive team removal",
      async () => {
        await db.departmentMembership.updateMany({
          where: { userId: member.id },
          data: { effectiveTo: new Date() },
        });
        assert.equal((await request(mc, `/api/v1/tasks/${id}`)).status, 404);
        assert.equal((await request(mc, avatarPath)).status, 404);
        const manual = await request(hc, `/api/v1/resources/${id}/grants`, "POST", {
          userId: invited.id,
          permission: "view",
        });
        assert.equal(manual.status, 201);
        const updated = await request(hc, `/api/v1/tasks/${id}`, "PATCH", {
          ...fields,
          taggedDepartmentIds: [],
          revision,
        });
        assert.equal(updated.status, 200);
        revision = updated.value.revision;
        assert.equal((await request(oc, `/api/v1/tasks/${id}`)).status, 404);
        const detail = taskSchema.parse((await request(nc, `/api/v1/tasks/${id}`)).value);
        assert.equal(detail.permissions.edit, false);
        assert.equal(detail.permissions.comment, false);
        assert.equal((await request(nc, `/api/v1/mention-targets?resourceId=${id}`)).status, 403);
        assert.equal(
          await db.resourceGrant.count({
            where: { resourceId: id, userId: invited.id, source: "task_team", revokedAt: null },
          }),
          0,
        );
        assert.equal(
          (await db.resourceGrant.findUniqueOrThrow({ where: { id: manual.value.id } })).revokedAt,
          null,
        );
      },
    );
    await t.test("Archiving a comment removes its shared avatar URL", async () => {
      const commentId = avatarPath.split("/")[6];
      const archived = await request(
        hc,
        `/api/v1/resources/${id}/comments/${commentId}/archive`,
        "POST",
        { revision: 1, text: "Host with avatar", mentions: [] },
      );
      assert.equal(archived.status, 201);
      assert.equal((await request(pc, avatarPath)).status, 404);
    });
    await t.test(
      "Inactive departments roll back creation and existing team survives restart",
      async () => {
        const before = await db.task.count();
        await db.department.update({ where: { id: department("IT") }, data: { active: false } });
        assert.equal(
          (
            await request(hc, "/api/v1/tasks", "POST", {
              ...fields,
              departmentId: department("FINANCE"),
            })
          ).status,
          400,
        );
        assert.equal(await db.task.count(), before);
        await app.close();
        app = await createApplication(undefined, false);
        await app.listen(0, "127.0.0.1");
        origin = "http://127.0.0.1:" + (app.getHttpServer().address() as AddressInfo).port;
        const row = taskSchema.parse((await request(pc, `/api/v1/tasks/${id}`)).value);
        assert.equal(row.revision, revision);
        assert.equal(row.permissions.edit, true);
        assert.equal((await request(nc, `/api/v1/tasks/${id}`)).value.permissions.edit, false);
      },
    );
  } finally {
    await app.close();
    await db.$disconnect();
  }
});
