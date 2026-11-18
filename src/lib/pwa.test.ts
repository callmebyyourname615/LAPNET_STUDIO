import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("Desktop manifest has standalone launch and correctly sized install icons", () => {
  const publicRoot = new URL("../../public/", import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL("manifest.webmanifest", publicRoot), "utf8"));
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.id, "/");
  assert.equal(manifest.start_url, "/dashboard");
  assert.equal(manifest.scope, "/");
  assert(manifest.name);
  for (const size of [192, 512]) {
    const icon = manifest.icons.find(
      (entry: { sizes: string }) => entry.sizes === `${size}x${size}`,
    );
    assert(icon, `Missing ${size}px install icon`);
    assert.equal(icon.type, "image/png");
    assert(icon.src.startsWith("/icons/"));
    const png = readFileSync(new URL(icon.src.slice(1), publicRoot));
    assert.deepEqual(png.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
  }
});
