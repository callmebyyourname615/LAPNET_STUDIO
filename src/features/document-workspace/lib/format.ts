import type { Lang } from "@/features/document-workspace/lib/i18n/strings";
const MONTHS = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  lo: [
    "ມ.ກ.",
    "ກ.ພ.",
    "ມ.ນ.",
    "ມ.ສ.",
    "ພ.ພ.",
    "ມິ.ຖ.",
    "ກ.ລ.",
    "ສ.ຫ.",
    "ກ.ຍ.",
    "ຕ.ລ.",
    "ພ.ຈ.",
    "ທ.ວ.",
  ],
};
/** Date-only: formatted from the string, never shifted by timezone. */
export function fmtDate(d: string | undefined, lang: Lang) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${Number(day)} ${MONTHS[lang][Number(m) - 1]} ${y}`;
}
export function fmtStamp(ts: string, lang: Lang) {
  const date = new Date(ts);
  if (!Number.isFinite(date.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Vientiane",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)!.value;
  return `${fmtDate(`${value("year")}-${value("month")}-${value("day")}`, lang)}, ${value("hour")}:${value("minute")} (UTC+07:00)`;
}
export function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
}
export const extOf = (name: string) =>
  name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
