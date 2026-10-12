import { NextResponse, type NextRequest } from "next/server";
import { apiError, rateLimit, requireApiUser, unauthorized } from "@/lib/server/api";
import { validatePodcast, type PodcastRow } from "@/lib/server/sources";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (!user) return unauthorized();
  if (!rateLimit(`validate:${user.id}`, 20, 10 * 60_000)) return apiError(429, "rate_limited", "Too many validations — wait a few minutes");
  const { id } = await ctx.params;
  const sb = user.sb;
  const { data: p } = await sb.from("podcasts").select("*").eq("id", id).eq("owner_id", user.id).maybeSingle();
  if (!p) return apiError(404, "not_found", "Show not found");
  const v = await validatePodcast(p as PodcastRow);
  const patch = { ...v.patch, validation_status: v.status, validation_detail: v.detail, ...(v.status !== "ok" ? { active: false } : {}) };
  await sb.from("podcasts").update(patch).eq("id", id).eq("owner_id", user.id);
  return NextResponse.json({ status: v.status, detail: v.detail });
}
