/** Documented demo clock: all overdue / due-today calculations use 9 November 2026 (Asia/Vientiane). */
export const DEMO_TODAY = "2026-11-09";
export const DEMO_TZ_OFFSET = "+07:00";
let tick = 0;
/** Deterministic "now" for demo mutations: 9 Nov 2026 15:00 +07:00 plus one minute per mutation. */
export function demoNow(): string {
  tick += 1;
  const total = 15 * 60 + tick;
  const h = String(Math.floor(total / 60) % 24).padStart(2, "0");
  const m = String(total % 60).padStart(2, "0");
  return `${DEMO_TODAY}T${h}:${m}:00${DEMO_TZ_OFFSET}`;
}
