import "server-only";
import { env } from "@/lib/env";
import { fetchRss } from "@/lib/server/providers/rss";
import { parseChannelRef, resolveChannel, type Quota } from "@/lib/server/providers/youtube";

export type PodcastRow = {
  id: string;
  owner_id: string;
  name: string;
  rss_url: string | null;
  youtube_channel_id: string | null;
  youtube_handle: string | null;
  spotify_show_id: string | null;
  apple_collection_id: string | null;
  artwork_url: string | null;
  host_names: string[];
  house_brands: string[];
  analyse_audio: boolean;
  min_episode_minutes: number | null;
  active: boolean;
  validation_status: "unverified" | "ok" | "needs_attention";
  validation_detail: string | null;
  last_success_at: string | null;
  last_attempt_at: string | null;
  last_error: string | null;
  checkpoint: Record<string, unknown>;
  is_sample: boolean;
};

export type ValidationResult = {
  status: "ok" | "needs_attention";
  detail: string;
  patch: Partial<PodcastRow>;
};

/** Validates every configured source of a show by actually calling it. */
export async function validatePodcast(p: Pick<PodcastRow, "rss_url" | "youtube_channel_id" | "youtube_handle" | "spotify_show_id" | "artwork_url">, quota: Quota = { units: 0 }): Promise<ValidationResult> {
  const notes: string[] = [];
  const patch: Partial<PodcastRow> = {};
  let anyOk = false;
  let anyBad = false;

  if (p.rss_url) {
    try {
      const r = await fetchRss(p.rss_url);
      if (r.notModified) {
        anyOk = true;
        notes.push("RSS ok (not modified)");
      } else {
        const latest = r.episodes.map((e) => e.publishedAt).sort().pop();
        notes.push(`RSS ok · ${r.episodes.length} items · latest ${latest ? latest.slice(0, 10) : "n/a"}`);
        anyOk = r.episodes.length > 0;
        if (!r.episodes.length) anyBad = true;
        if (!p.artwork_url && r.artwork) patch.artwork_url = r.artwork;
      }
    } catch (e) {
      anyBad = true;
      notes.push(`RSS failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const ytRef = p.youtube_channel_id ? { id: p.youtube_channel_id } : p.youtube_handle ? parseChannelRef(p.youtube_handle) : null;
  if (ytRef) {
    const key = env().YOUTUBE_API_KEY;
    if (!key) {
      notes.push("YouTube configured but YOUTUBE_API_KEY missing");
      if (!p.rss_url) anyBad = true;
    } else {
      try {
        const ch = await resolveChannel(ytRef, key, quota);
        if (ch) {
          anyOk = true;
          patch.youtube_channel_id = ch.id;
          if (!p.artwork_url && ch.thumbnail) patch.artwork_url = ch.thumbnail;
          notes.push(`YouTube ok · ${ch.title}`);
        } else {
          anyBad = true;
          notes.push("YouTube channel not found");
        }
      } catch (e) {
        anyBad = true;
        notes.push(`YouTube failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  if (p.spotify_show_id) notes.push("Spotify link stored");
  if (!p.rss_url && !ytRef) {
    return { status: "needs_attention", detail: "Add an RSS feed or a YouTube channel", patch };
  }
  return { status: anyOk && !anyBad ? "ok" : anyOk ? "ok" : "needs_attention", detail: notes.join(" · "), patch };
}
