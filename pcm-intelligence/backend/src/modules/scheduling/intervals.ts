import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
export const TIMEZONE = "America/Sao_Paulo";
export const ACTIVE = ["SCHEDULED", "IN_PROGRESS", "BLOCKED"];
export type Range = { start: number; end: number };
export type Window = {
  weekday: number;
  startMinute: number;
  endMinute: number;
  active: boolean;
};
export const asRange = (r: { startsAt: Date; endsAt: Date }): Range => ({
  start: r.startsAt.getTime(),
  end: r.endsAt.getTime(),
});
export const overlaps = (a: Range, b: Range) =>
  a.start < b.end && b.start < a.end;
export function merge(ranges: Range[]) {
  const result: Range[] = [];
  for (const r of ranges
    .filter((r) => r.end > r.start)
    .sort((a, b) => a.start - b.start)) {
    const last = result.at(-1);
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else result.push({ ...r });
  }
  return result;
}
export function subtract(windows: Range[], busy: Range[]) {
  let free = merge(windows);
  for (const b of merge(busy)) {
    free = free.flatMap((w) =>
      !overlaps(w, b)
        ? [w]
        : [
            { start: w.start, end: Math.min(w.end, b.start) },
            { start: Math.max(w.start, b.end), end: w.end },
          ].filter((r) => r.end > r.start),
    );
  }
  return free;
}
export const minutes = (ranges: Range[]) =>
  Math.round(merge(ranges).reduce((n, r) => n + r.end - r.start, 0) / 60000);
export function dayAfter(date: string) {
  return new Date(new Date(date + "T12:00:00Z").getTime() + 86400000)
    .toISOString()
    .slice(0, 10);
}
function minuteAt(day: string, minute: number) {
  if (minute === 1440)
    return fromZonedTime(dayAfter(day) + "T00:00:00", TIMEZONE).getTime();
  return fromZonedTime(
    day +
      "T" +
      String(Math.floor(minute / 60)).padStart(2, "0") +
      ":" +
      String(minute % 60).padStart(2, "0") +
      ":00",
    TIMEZONE,
  ).getTime();
}
export function workIntervals(windows: Window[], from: Date, to: Date) {
  const ranges: Range[] = [];
  for (
    let day = formatInTimeZone(from, TIMEZONE, "yyyy-MM-dd"),
      last = formatInTimeZone(to, TIMEZONE, "yyyy-MM-dd");
    day <= last;
    day = dayAfter(day)
  ) {
    const weekday = new Date(day + "T12:00:00Z").getUTCDay();
    for (const w of windows.filter((w) => w.active && w.weekday === weekday)) {
      const start = Math.max(from.getTime(), minuteAt(day, w.startMinute)),
        end = Math.min(to.getTime(), minuteAt(day, w.endMinute));
      if (end > start) ranges.push({ start, end });
    }
  }
  return merge(ranges);
}
export function fits(slot: Range, windows: Range[]) {
  return merge(windows).some((w) => w.start <= slot.start && w.end >= slot.end);
}
export function firstSlot(
  windows: Range[],
  busy: Range[],
  durationMinutes: number,
  notBefore: number,
) {
  const duration = durationMinutes * 60000;
  for (const free of subtract(windows, busy)) {
    const start = Math.ceil(Math.max(free.start, notBefore) / 60000) * 60000;
    if (start + duration <= free.end) return { start, end: start + duration };
  }
  return null;
}
