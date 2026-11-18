import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
export const ZONE = "America/Sao_Paulo";
export const today = () => formatInTimeZone(new Date(), ZONE, "yyyy-MM-dd");
export const plusDays = (day: string, n: number) =>
  new Date(new Date(day + "T12:00:00Z").getTime() + n * 86400000)
    .toISOString()
    .slice(0, 10);
export const dateLabel = (day: string) =>
  day.slice(8, 10) + "/" + day.slice(5, 7);
export const clock = (value: string) =>
  formatInTimeZone(new Date(value), ZONE, "HH:mm");
export const dateTime = (value: string) =>
  formatInTimeZone(new Date(value), ZONE, "dd/MM/yyyy HH:mm");
export const inputDate = (value: string) =>
  formatInTimeZone(new Date(value), ZONE, "yyyy-MM-dd'T'HH:mm");
export const toIso = (value: string) =>
  fromZonedTime(value, ZONE).toISOString();
export function calendarRange(anchor: string, view: "week" | "month") {
  const d = new Date(anchor + "T12:00:00Z"),
    weekday = (d.getUTCDay() + 6) % 7;
  let start: string, end: string;
  if (view === "week") {
    start = plusDays(anchor, -weekday);
    end = plusDays(start, 7);
  } else {
    const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 12))
      .toISOString()
      .slice(0, 10);
    start = plusDays(
      first,
      -((new Date(first + "T12:00:00Z").getUTCDay() + 6) % 7),
    );
    const next = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 12),
    )
      .toISOString()
      .slice(0, 10);
    end = plusDays(
      next,
      (7 - ((new Date(next + "T12:00:00Z").getUTCDay() + 6) % 7)) % 7,
    );
  }
  const days: string[] = [];
  for (let x = start; x < end; x = plusDays(x, 1)) days.push(x);
  return {
    start,
    end,
    days,
    from: toIso(start + "T00:00"),
    to: toIso(end + "T00:00"),
  };
}
export function moveAnchor(
  anchor: string,
  view: "week" | "month",
  direction: number,
) {
  if (view === "week") return plusDays(anchor, direction * 7);
  const d = new Date(anchor + "T12:00:00Z");
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + direction, 1, 12),
  )
    .toISOString()
    .slice(0, 10);
}
export function defaultSlot(day?: string) {
  const base =
    day && day > today()
      ? fromZonedTime(day + "T08:00", ZONE)
      : new Date(Math.ceil(Date.now() / 900000) * 900000);
  return {
    startsAt: inputDate(base.toISOString()),
    endsAt: inputDate(new Date(base.getTime() + 3600000).toISOString()),
  };
}
export const weekdays = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];
export const minuteInput = (v: number) =>
  v === 1440
    ? "24:00"
    : String(Math.floor(v / 60)).padStart(2, "0") +
      ":" +
      String(v % 60).padStart(2, "0");
export const inputMinute = (s: string) =>
  Number(s.split(":")[0]) * 60 + Number(s.split(":")[1]);
