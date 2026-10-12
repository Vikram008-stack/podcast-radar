import { describe, expect, it } from "vitest";
import { dueAt, formatIst, istParts, periodFromStart, reportingPeriod } from "@/lib/time";

// IST = UTC+05:30. Monday 13 Oct 2025 00:00 IST = Sunday 12 Oct 2025 18:30 UTC.
const ist = (y: number, m: number, d: number, h = 0, mi = 0, s = 0, ms = 0) => new Date(Date.UTC(y, m - 1, d, h, mi, s, ms) - 330 * 60_000);

describe("IST reporting week", () => {
  it("a run on Monday 06:00 IST reports the previous Monday→Sunday", () => {
    const p = reportingPeriod(ist(2026, 10, 12, 6, 0));
    expect(p.start.toISOString()).toBe(ist(2026, 10, 5).toISOString());
    expect(p.end.toISOString()).toBe(ist(2026, 10, 11, 23, 59, 59, 999).toISOString());
    expect(p.key).toBe("2026-10-05");
  });

  it("Sunday 23:59 IST still belongs to the week before the previous completed one", () => {
    const p = reportingPeriod(ist(2026, 10, 11, 23, 59));
    expect(p.key).toBe("2026-09-28");
  });

  it("Monday 00:00 IST flips to the just-finished week", () => {
    expect(reportingPeriod(ist(2026, 10, 12, 0, 0)).key).toBe("2026-10-05");
    expect(reportingPeriod(new Date(ist(2026, 10, 12).getTime() - 1)).key).toBe("2026-09-28");
  });

  it("uses IST even when UTC is still the previous day", () => {
    // 2026-10-11T19:00Z is Monday 00:30 IST
    expect(reportingPeriod(new Date("2026-10-11T19:00:00Z")).key).toBe("2026-10-05");
  });

  it("30-day window ends at the same Sunday and previous week is 7 days before", () => {
    const p = periodFromStart(ist(2026, 10, 5));
    expect(p.end.getTime() - p.start30.getTime() + 1).toBe(30 * 86_400_000);
    expect(p.start.getTime() - p.prevStart.getTime()).toBe(7 * 86_400_000);
  });

  it("brief is due Monday 06:00 IST", () => {
    const p = periodFromStart(ist(2026, 10, 5));
    expect(dueAt(p).toISOString()).toBe("2026-10-12T00:30:00.000Z");
  });

  it("formats as DD MMM YYYY, HH:mm IST", () => {
    expect(formatIst("2026-10-12T00:30:00Z")).toBe("12 Oct 2026, 06:00 IST");
    expect(istParts(new Date("2026-10-12T00:30:00Z")).weekday).toBe(1);
  });
});
