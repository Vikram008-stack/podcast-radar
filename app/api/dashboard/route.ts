import { NextResponse } from "next/server";
import { featured, featuredGuests } from "@/lib/metrics";
import { requireApiUser, unauthorized } from "@/lib/server/api";
import { getReport, lastScan } from "@/lib/server/data";

/** Home payload: latest brief summary + scan state. */
export async function GET() {
  if (!(await requireApiUser())) return unauthorized();
  const [report, scan] = await Promise.all([getReport(), lastScan()]);
  const s = report?.snapshot;
  return NextResponse.json({
    scan,
    report: report ? { id: report.id, version: report.version, status: report.status, periodStart: report.period_start, periodEnd: report.period_end, generatedAt: report.generated_at } : null,
    sources: s ? { collected: s.sourcesCollected, total: s.sourcesTotal, items: s.sources } : null,
    featured: s ? { guests: featuredGuests(s.guests, 3), topics: featured(s.topics, 3), sponsors: s.sponsors.slice(0, 3) } : null,
    opportunity: s?.opportunity ?? null,
    counts: s ? { guests: s.guests.length, topics: s.topics.length, sponsors: s.sponsors.length, otherBrands: s.otherBrands.length } : null,
  });
}
