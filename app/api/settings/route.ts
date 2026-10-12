import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError, requireApiUser, unauthorized } from "@/lib/server/api";

const body = z.object({
  report_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  timezone: z.string().min(1).max(60).refine((tz) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Unknown timezone").optional(),
  min_episode_minutes: z.number().int().min(1).max(240).optional(),
});

/** Report day is fixed to Monday; only time + timezone (and clip threshold) are editable. */
export async function PATCH(req: NextRequest) {
  const user = await requireApiUser();
  if (!user) return unauthorized();
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "bad_request", parsed.error.issues[0]?.message ?? "Invalid settings");
  const sb = user.sb;
  const { data, error } = await sb
    .from("app_settings")
    .upsert({ owner_id: user.id, ...parsed.data, updated_at: new Date().toISOString() }, { onConflict: "owner_id" })
    .select("timezone,report_time,min_episode_minutes")
    .single();
  if (error) return apiError(500, "db_error", "Could not save settings");
  return NextResponse.json({ settings: data });
}
