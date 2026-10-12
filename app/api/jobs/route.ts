import { NextResponse, type NextRequest } from "next/server";
import { apiError, pageParams, requireApiUser, unauthorized } from "@/lib/server/api";

export async function GET(req: NextRequest) {
  const actor = await requireApiUser();
  if (!actor) return unauthorized();
  const { limit, offset } = pageParams(req.nextUrl, 20);
  const sb = actor.sb;
  const { data, error, count } = await sb
    .from("ingestion_jobs")
    .select("id,type,trigger,period_key,status,retries,error_summary,provider_calls,started_at,finished_at", { count: "exact" })
    .eq("owner_id", actor.id)
    .order("started_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) return apiError(500, "db_error", "Could not load jobs");
  return NextResponse.json({ items: data, total: count, limit, offset });
}
