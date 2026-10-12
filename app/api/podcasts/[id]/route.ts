import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError, requireApiUser, unauthorized } from "@/lib/server/api";
import { podcastPatch, toColumns } from "@/lib/server/podcast-input";
import { validatePodcast, type PodcastRow } from "@/lib/server/sources";

const idSchema = z.string().uuid();

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const actor = await requireApiUser();
  if (!actor) return unauthorized();
  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) return apiError(400, "bad_request", "Invalid id");
  const parsed = podcastPatch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "bad_request", parsed.error.issues[0]?.message ?? "Invalid input");
  let cols: Record<string, unknown>;
  try {
    cols = toColumns(parsed.data);
  } catch (e) {
    return apiError(400, "bad_source", e instanceof Error ? e.message : "Invalid source");
  }
  const sb = actor.sb;
  const { data: current } = await sb.from("podcasts").select("*").eq("id", id).eq("owner_id", actor.id).maybeSingle();
  if (!current) return apiError(404, "not_found", "Show not found");
  const next = { ...(current as PodcastRow), ...cols } as PodcastRow;
  const sourcesChanged = ["rss_url", "youtube_handle", "youtube_channel_id", "spotify_show_id"].some((k) => k in cols);
  if (sourcesChanged) {
    if ("youtube_handle" in cols || "youtube_channel_id" in cols) next.checkpoint = { ...(next.checkpoint ?? {}), youtube: undefined };
    if ("rss_url" in cols) next.checkpoint = { ...(next.checkpoint ?? {}), rss: undefined };
    const v = await validatePodcast(next);
    Object.assign(cols, v.patch, { validation_status: v.status, validation_detail: v.detail, checkpoint: next.checkpoint });
    if (v.status !== "ok") cols.active = false;
  }
  if (cols.active === true && (next.validation_status !== "ok" && cols.validation_status !== "ok")) {
    return apiError(409, "not_verified", "Validate this show's feeds before enabling it");
  }
  const { data, error } = await sb.from("podcasts").update({ ...cols, updated_at: new Date().toISOString() }).eq("id", id).eq("owner_id", actor.id).select("id,active,validation_status,validation_detail").single();
  if (error) return apiError(500, "db_error", "Could not update the show");
  return NextResponse.json({ podcast: data });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const actor = await requireApiUser();
  if (!actor) return unauthorized();
  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) return apiError(400, "bad_request", "Invalid id");
  const sb = actor.sb;
  const { error, count } = await sb.from("podcasts").delete({ count: "exact" }).eq("id", id).eq("owner_id", actor.id);
  if (error) return apiError(500, "db_error", "Could not remove the show");
  if (!count) return apiError(404, "not_found", "Show not found");
  return NextResponse.json({ ok: true });
}
