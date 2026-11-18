import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import sharp from "sharp";
import { createDatabase } from "@lapnet/database";
import { meSchema } from "@lapnet/contracts";
import { createApplication } from "../src/app";
import { hashPassword, randomSecret } from "../src/identity/password";
import { normalizeUserImage, MAX_USER_IMAGE_BYTES } from "../src/identity/images.service";

test("Account image normalization decodes, crops and strips metadata", async () => {
  const original = await sharp({
    create: { width: 60, height: 100, channels: 3, background: "#a5b3c7" },
  })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();
  const avatar = await normalizeUserImage(original, "avatar"),
    avatarInfo = await sharp(avatar).metadata();
  assert.equal(avatarInfo.format, "webp");
  assert.equal(avatarInfo.width, 512);
  assert.equal(avatarInfo.height, 512);
  assert(!avatarInfo.exif);
  assert(!avatarInfo.orientation);
  const cover = await normalizeUserImage(original, "cover"),
    coverInfo = await sharp(cover).metadata();
  assert(coverInfo.width! <= 2400);
  assert(coverInfo.height! <= 1200);
  assert(Math.abs(coverInfo.width! / coverInfo.height! - 100 / 60) < 0.01);
  await assert.rejects(
    normalizeUserImage(
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'),
      "avatar",
    ),
  );
  await assert.rejects(normalizeUserImage(Buffer.from("not an image"), "cover"));
  await assert.rejects(normalizeUserImage(Buffer.alloc(0), "avatar"));
  await assert.rejects(normalizeUserImage(Buffer.alloc(MAX_USER_IMAGE_BYTES + 1), "avatar"));
});

test(
  "Persistent personal profile and account images",
  { skip: !process.env.TEST_IDENTITY_DATABASE_URL },
  async (t) => {
    const connection = process.env.TEST_IDENTITY_DATABASE_URL!,
      url = new URL(connection);
    assert(
      url.hostname === "127.0.0.1" &&
        url.port === "55432" &&
        /^\/lapnet_identity_[a-f0-9]+$/.test(url.pathname),
    );
    process.env.DATABASE_URL = connection;
    process.env.APP_ORIGIN = "http://127.0.0.1:5173";
    const db = createDatabase(connection),
      password = randomSecret().slice(0, 24),
      passwordHash = await hashPassword(password);
    const [owner, other] = await Promise.all(
      ["account_owner", "account_other"].map((username) =>
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
          ...(body !== undefined
            ? {
                "content-type": Buffer.isBuffer(body)
                  ? "application/octet-stream"
                  : "application/json",
              }
            : {}),
        },
        ...(body !== undefined
          ? { body: Buffer.isBuffer(body) ? Uint8Array.from(body).buffer : JSON.stringify(body) }
          : {}),
      });
      const cookie = response.headers.get("set-cookie");
      if (cookie) c.cookie = cookie.split(";")[0];
      const bytes = Buffer.from(await response.arrayBuffer());
      const value = response.headers.get("content-type")?.includes("application/json")
        ? JSON.parse(bytes.toString())
        : undefined;
      if (value?.csrfToken) c.csrf = value.csrfToken;
      return { status: response.status, value, bytes, headers: response.headers };
    }
    async function login(username: string) {
      const c = { cookie: "", csrf: "" };
      assert.equal((await request(c, "/auth/login", "POST", { username, password })).status, 201);
      return c;
    }
    const c = await login(owner.username!),
      outsider = await login(other.username!),
      anonymous = { cookie: "", csrf: "" };
    const image = await sharp({
      create: { width: 90, height: 60, channels: 3, background: "#546fa3" },
    })
      .png()
      .toBuffer();
    const path = "/api/v1/me/images/";
    try {
      await t.test(
        "Account images require a session and CSRF, without requiring organization membership",
        async () => {
          assert.equal((await request(anonymous, path + "avatar")).status, 401);
          assert.equal((await request(c, path + "avatar")).status, 404);
          const me = meSchema.parse((await request(c, "/api/v1/me")).value);
          assert.equal(me.user.avatarUrl, null);
          assert.equal(me.user.coverUrl, null);
          assert.equal((await request(c, path + "avatar", "PUT", image, false)).status, 403);
          assert.equal((await request(c, path + "avatar", "DELETE", undefined, false)).status, 403);
        },
      );
      await t.test(
        "Uploads persist normalized pixels and return versioned self-only URLs",
        async () => {
          const avatar = await request(c, path + "avatar", "PUT", image);
          assert.equal(avatar.status, 200);
          assert.equal(avatar.value.url, path + "avatar?v=1");
          const cover = await request(c, path + "cover", "PUT", image);
          assert.equal(cover.status, 200);
          assert.equal(cover.value.url, path + "cover?v=1");
          const downloaded = await request(c, avatar.value.url);
          assert.equal(downloaded.status, 200);
          assert.equal(downloaded.headers.get("content-type"), "image/webp");
          assert.match(downloaded.headers.get("cache-control")!, /private.*no-store/);
          const metadata = await sharp(downloaded.bytes).metadata();
          assert.equal(metadata.width, 512);
          assert(!downloaded.bytes.equals(image));
          const me = meSchema.parse((await request(c, "/api/v1/me")).value);
          assert.equal(me.user.avatarUrl, avatar.value.url);
          assert.equal(me.user.coverUrl, cover.value.url);
          assert.equal(
            await db.auditEvent.count({
              where: { actorId: owner.id, action: "account.avatar_updated" },
            }),
            1,
          );
        },
      );
      await t.test(
        "Another account cannot read or replace an owner image through identifiers",
        async () => {
          assert.equal((await request(outsider, path + "avatar")).status, 404);
          assert.equal((await request(outsider, path + "avatar?userId=" + owner.id)).status, 404);
          assert.equal(
            (await request(outsider, "/api/v1/users/" + owner.id + "/images/avatar")).status,
            404,
          );
          assert.equal((await request(c, path + owner.id, "PUT", image)).status, 400);
          assert.equal(
            (
              await db.userImage.findUniqueOrThrow({
                where: { userId_kind: { userId: owner.id, kind: "avatar" } },
              })
            ).revision,
            1,
          );
        },
      );
      await t.test("Invalid uploads keep the previous image", async () => {
        assert.equal(
          (await request(c, path + "avatar", "PUT", Buffer.from("bad.png"))).status,
          400,
        );
        assert.equal(
          (
            await request(
              c,
              path + "cover",
              "PUT",
              Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"/>'),
            )
          ).status,
          400,
        );
        assert.equal(
          (await request(c, path + "cover", "PUT", { url: "https://invalid.test/image.png" }))
            .status,
          400,
        );
        assert.equal(
          (await request(c, path + "avatar", "PUT", Buffer.alloc(MAX_USER_IMAGE_BYTES + 1))).status,
          413,
        );
        assert.equal((await request(c, path + "avatar?v=1")).status, 200);
      });
      await t.test(
        "Profile fields save with revision checks while identity, roles and organization stay protected",
        async () => {
          const fields = {
            displayName: "ສົມພອນ",
            fullName: "Somphone Test",
            contactEmail: "somphone@example.com",
            phone: "+856 20 0000 0000",
            address: "Vientiane",
            headline: "Operations designer",
            about: "I build useful internal tools.",
            skills: ["Design", "TypeScript"],
            website: "https://example.com",
            github: "",
            linkedin: "",
            revision: 0,
          };
          assert.equal(
            (await request(c, "/api/v1/me/profile", "PATCH", fields, false)).status,
            403,
          );
          assert.equal(
            (await request(c, "/api/v1/me/profile", "PATCH", { ...fields, username: "takeover" }))
              .status,
            400,
          );
          assert.equal(
            (
              await request(c, "/api/v1/me/profile", "PATCH", {
                ...fields,
                website: "javascript:alert(1)",
              })
            ).status,
            400,
          );
          assert.equal((await request(c, "/api/v1/me/profile", "PATCH", fields)).status, 200);
          assert.equal(
            (
              await request(c, "/api/v1/me/profile", "PATCH", {
                ...fields,
                revision: 1,
                contactEmail: "invalid",
              })
            ).status,
            400,
          );
          assert.equal(
            (await request(c, "/api/v1/me/profile", "PATCH", { ...fields, about: "Stale changes" }))
              .status,
            409,
          );
          const me = meSchema.parse((await request(c, "/api/v1/me")).value);
          assert.equal(me.user.displayName, fields.displayName);
          assert.equal(me.user.username, owner.username);
          assert.equal(me.user.profile.fullName, fields.fullName);
          assert.equal(me.user.profile.contactEmail, fields.contactEmail);
          assert.equal(me.user.profile.phone, fields.phone);
          assert.equal(me.user.profile.address, fields.address);
          assert.equal(me.user.profile.about, fields.about);
          assert.deepEqual(me.user.profile.skills, fields.skills);
          assert.equal(
            meSchema.parse((await request(outsider, "/api/v1/me")).value).user.profile.about,
            "",
          );
        },
      );
      await t.test(
        "Concurrent replacements serialize; profile and pictures survive restarting the API",
        async () => {
          const results = await Promise.all([
            request(c, path + "avatar", "PUT", image),
            request(c, path + "avatar", "PUT", image),
          ]);
          assert.deepEqual(
            results.map((r) => r.status),
            [200, 200],
          );
          assert.equal(
            (
              await db.userImage.findUniqueOrThrow({
                where: { userId_kind: { userId: owner.id, kind: "avatar" } },
              })
            ).revision,
            3,
          );
          await app.close();
          app = await createApplication(undefined, false);
          await app.listen(0, "127.0.0.1");
          origin = "http://127.0.0.1:" + (app.getHttpServer().address() as AddressInfo).port;
          const me = meSchema.parse((await request(c, "/api/v1/me")).value);
          assert.equal(me.user.avatarUrl, path + "avatar?v=3");
          assert.equal(me.user.profile.headline, "Operations designer");
          assert.equal((await request(c, me.user.coverUrl!)).status, 200);
        },
      );
      await t.test(
        "Removing a picture restores its default without deleting the other picture or profile",
        async () => {
          assert.equal((await request(c, path + "avatar", "DELETE")).status, 200);
          assert.equal((await request(c, path + "avatar")).status, 404);
          const me = meSchema.parse((await request(c, "/api/v1/me")).value);
          assert.equal(me.user.avatarUrl, null);
          assert(me.user.coverUrl);
          assert.equal(me.user.profile.skills.length, 2);
        },
      );
    } finally {
      await app.close();
      await db.$disconnect();
    }
  },
);
