import { NextResponse, type NextRequest } from "next/server";
import { apiError, pageParams, requireApiUser, unauthorized } from "@/lib/server/api";
import { podcastCreate, toColumns } from "@/lib/server/podcast-input";
import { validatePodcast } from "@/lib/server/sources";

const COLS =
  "id,name,rss_url,youtube_channel_id,youtube_handle,spotify_show_id,apple_collection_id,artwork_url,host_names,house_brands,analyse_audio,min_episode_minutes,active,validation_status,validation_detail,last_success_at,last_attempt_at,last_error";

export async function GET(req: NextRequest) {
  const actor = await requireApiUser();
  if (!actor) return unauthorized();
  const { limit, offset } = pageParams(req.nextUrl);
  const sb = actor.sb;
  const { data, error, count } = await sb.from("podcasts").select(COLS, { count: "exact" }).eq("owner_id", actor.id).eq("is_sample", false).order("name").range(offset, offset + limit - 1);
  if (error) return apiError(500, "db_error", "Could not load podcasts");
  return NextResponse.json({ items: data, total: count, limit, offset });
}

export async function POST(req: NextRequest) {
  const user = await requireApiUser();
  if (!user) return unauthorized();
  const parsed = podcastCreate.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "bad_request", parsed.error.issues[0]?.message ?? "Invalid input");
  let cols: Record<string, unknown>;
  try {
    cols = toColumns(parsed.data);
  } catch (e) {
    return apiError(400, "bad_source", e instanceof Error ? e.message : "Invalid source");
  }
  if (!cols.rss_url && !cols.youtube_handle && !cols.youtube_channel_id) return apiError(400, "no_source", "Add an RSS feed or a YouTube channel");
  const v = await validatePodcast({
    rss_url: (cols.rss_url as string) ?? null,
    youtube_channel_id: (cols.youtube_channel_id as string) ?? null,
    youtube_handle: (cols.youtube_handle as string) ?? null,
    spotify_show_id: (cols.spotify_show_id as string) ?? null,
    artwork_url: parsed.data.artwork_url ?? null,
  });
  const sb = user.sb;
  const { data, error } = await sb
    .from("podcasts")
    .insert({
      ...cols,
      owner_id: user.id,
      apple_collection_id: parsed.data.apple_collection_id ?? null,
      artwork_url: parsed.data.artwork_url ?? null,
      ...v.patch,
      validation_status: v.status,
      validation_detail: v.detail,
      active: v.status === "ok", // never mark live without a verified source
    })
    .select(COLS)
    .single();
  if (error) return apiError(error.code === "23505" ? 409 : 500, error.code === "23505" ? "duplicate" : "db_error", error.code === "23505" ? "A show with that name already exists" : "Could not save the show");
  return NextResponse.json({ podcast: data }, { status: 201 });
}
