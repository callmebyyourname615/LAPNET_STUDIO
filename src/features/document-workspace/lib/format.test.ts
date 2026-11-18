import assert from "node:assert/strict";
import { test } from "node:test";
import { fmtDate, fmtStamp } from "./format.ts";

test("Document timestamps use Vientiane time across offsets and midnight", () => {
  assert.equal(fmtStamp("2026-11-17T13:28:22.909Z", "en"), "17 Nov 2026, 20:28 (UTC+07:00)");
  assert.equal(fmtStamp("2026-11-17T20:28:22+07:00", "en"), "17 Nov 2026, 20:28 (UTC+07:00)");
  assert.equal(fmtStamp("2026-11-17T18:00:00Z", "lo"), "18 ພ.ຈ. 2026, 01:00 (UTC+07:00)");
  assert.equal(fmtStamp("invalid", "en"), "—");
  assert.equal(fmtDate("2026-11-17", "en"), "17 Nov 2026");
});
