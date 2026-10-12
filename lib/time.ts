/**
 * IST reporting windows. India has no DST, so IST = UTC+05:30 always.
 * Reporting week = previous Monday 00:00 IST → Sunday 23:59:59.999 IST.
 * 30-day window ends at the same Sunday.
 */
export const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const DAY = 86_400_000;

/** Wall-clock parts of an instant in IST. */
export function istParts(d: Date) {
  const t = new Date(d.getTime() + IST_OFFSET_MS);
  return {
    year: t.getUTCFullYear(),
    month: t.getUTCMonth(),
    day: t.getUTCDate(),
    weekday: t.getUTCDay(), // 0 = Sunday
    hour: t.getUTCHours(),
    minute: t.getUTCMinutes(),
  };
}

/** UTC instant of IST midnight on the IST calendar day containing `d`. */
export function istMidnight(d: Date): Date {
  const p = istParts(d);
  return new Date(Date.UTC(p.year, p.month, p.day) - IST_OFFSET_MS);
}

export type Period = {
  /** Monday 00:00 IST of the reporting week (UTC instant). */
  start: Date;
  /** Sunday 23:59:59.999 IST of the reporting week. */
  end: Date;
  /** Start of the 30-day window ending at `end`. */
  start30: Date;
  /** Previous week's start (for topic change). */
  prevStart: Date;
  /** yyyy-mm-dd of the IST Monday. */
  key: string;
};

/**
 * The reporting period for a run happening at `now`: the most recent
 * *completed* Monday–Sunday IST week.
 */
export function reportingPeriod(now: Date = new Date()): Period {
  const todayMid = istMidnight(now);
  const weekday = istParts(now).weekday; // 0 Sun..6 Sat
  const daysSinceMonday = (weekday + 6) % 7;
  const thisMonday = new Date(todayMid.getTime() - daysSinceMonday * DAY);
  const start = new Date(thisMonday.getTime() - 7 * DAY);
  return periodFromStart(start);
}

export function periodFromStart(start: Date): Period {
  const end = new Date(start.getTime() + 7 * DAY - 1);
  const start30 = new Date(end.getTime() + 1 - 30 * DAY);
  const prevStart = new Date(start.getTime() - 7 * DAY);
  const p = istParts(start);
  const key = `${p.year}-${String(p.month + 1).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  return { start, end, start30, prevStart, key };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** `DD MMM YYYY, HH:mm IST` */
export function formatIst(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const p = istParts(new Date(d));
  return `${String(p.day).padStart(2, "0")} ${MONTHS[p.month]} ${p.year}, ${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")} IST`;
}

/** `DD MMM YYYY` */
export function formatIstDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const p = istParts(new Date(d));
  return `${String(p.day).padStart(2, "0")} ${MONTHS[p.month]} ${p.year}`;
}

/** `DD MMM` */
export function formatIstShort(d: Date | string): string {
  const p = istParts(new Date(d));
  return `${String(p.day).padStart(2, "0")} ${MONTHS[p.month]}`;
}

/** e.g. "Monday 13 Oct" */
export function formatIstWeekday(d: Date | string): string {
  const p = istParts(new Date(d));
  return `${DAYS[p.weekday]} ${String(p.day).padStart(2, "0")} ${MONTHS[p.month]}`;
}

export function formatRange(start: Date | string, end: Date | string): string {
  return `${formatIstShort(start)} – ${formatIstDate(end)}`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m} min`;
}

export function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function inWindow(d: Date | string, from: Date, to: Date): boolean {
  const t = new Date(d).getTime();
  return t >= from.getTime() && t <= to.getTime();
}

/** The Monday-06:00-IST instant on which the report for `period` is due. */
export function dueAt(period: Period, hour = 6, minute = 0): Date {
  return new Date(period.end.getTime() + 1 + (hour * 60 + minute) * 60_000);
}

/** Request-time clock for server components (keeps render functions free of direct Date.now calls). */
export function nowMs(): number {
  return Date.now();
}
