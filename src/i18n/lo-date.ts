const calendar = "gregory";
const timeZone = "Asia/Vientiane";
const laoDate = Intl.DateTimeFormat.supportedLocalesOf("lo-LA").length
  ? new Intl.DateTimeFormat("lo-LA", { dateStyle: "full", calendar, timeZone })
  : null;
const dateParts = new Intl.DateTimeFormat("en-GB", {
  calendar,
  timeZone,
  weekday: "short",
  day: "numeric",
  month: "numeric",
  year: "numeric",
});
const weekdays: Record<string, string> = {
  Sun: "ວັນອາທິດ",
  Mon: "ວັນຈັນ",
  Tue: "ວັນອັງຄານ",
  Wed: "ວັນພຸດ",
  Thu: "ວັນພະຫັດ",
  Fri: "ວັນສຸກ",
  Sat: "ວັນເສົາ",
};
const months = [
  "ມັງກອນ",
  "ກຸມພາ",
  "ມີນາ",
  "ເມສາ",
  "ພຶດສະພາ",
  "ມິຖຸນາ",
  "ກໍລະກົດ",
  "ສິງຫາ",
  "ກັນຍາ",
  "ຕຸລາ",
  "ພະຈິກ",
  "ທັນວາ",
];
export const vientianeClock = new Intl.DateTimeFormat("en-GB", {
  timeZone,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function formatLaoFullDate(date: Date) {
  if (laoDate) return laoDate.format(date);

  // Chromium may lack Lao date data and fall back to the browser's language.
  const { weekday, day, month, year } = Object.fromEntries(
    dateParts.formatToParts(date).map(({ type, value }) => [type, value]),
  );
  return `${weekdays[weekday]}, ${Number(day)} ${months[Number(month) - 1]} ${year}`;
}

export function formatLaoTimestamp(value: string) {
  const date = new Date(value);
  return `${formatLaoFullDate(date)} · ${vientianeClock.format(date)}`;
}
