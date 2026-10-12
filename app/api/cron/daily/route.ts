import { after, NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { apiError, cronAuthorized } from "@/lib/server/api";
import { db, ownerId } from "@/lib/server/db";
import { continueChunk, runChunk } from "@/lib/server/scan";
import type { Trigger } from "@/lib/server/pipeline/weekly";
import { istParts, reportingPeriod } from "@/lib/time";

export const maxDuration = 300;

/**
 * Daily Vercel Cron (protected by CRON_SECRET):
 *  (a) touches the database so the Supabase Free project stays active;
 *  (b) from Monday after 07:00 IST, if this week's brief is not ready, runs a chunked catch-up
 *      (checkpointed per show) and chains the next chunk until the brief is built.
 */
export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) return apiError(401, "unauthorized", "Missing or wrong cron secret");
  const owner = await ownerId();
  await db().from("app_settings").upsert({ owner_id: owner, updated_at: new Date().toISOString() }, { onConflict: "owner_id" });

  const isContinue = req.nextUrl.searchParams.get("continue") === "1";
  const trigger = (req.nextUrl.searchParams.get("trigger") === "manual" ? "manual" : "catchup") as Trigger;
  const now = new Date();
  const p = istParts(now);
  const graceHour = env().REPORT_HOUR + 1;
  const pastDue = p.weekday !== 1 || p.hour >= graceHour; // Monday after 07:00 IST, or any later day
  const period = reportingPeriod(now);
  const { data: rep } = await db().from("weekly_reports").select("status").eq("owner_id", owner).eq("is_sample", false).eq("period_start", period.start.toISOString()).maybeSingle();

  if (!isContinue && (!pastDue || rep?.status === "ready")) {
    return NextResponse.json({ ok: true, keepAlive: true, catchUp: false, reason: rep?.status === "ready" ? "brief ready" : "not due yet" });
  }
  const origin = req.nextUrl.origin;
  after(async () => {
    const res = await runChunk(trigger);
    if (res.status === "continue") await continueChunk(origin, trigger);
  });
  return NextResponse.json({ ok: true, keepAlive: true, catchUp: true, period: period.key });
}
