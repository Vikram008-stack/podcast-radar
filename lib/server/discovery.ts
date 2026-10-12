import "server-only";
import { titlesMatch } from "@/lib/text";
import { env } from "@/lib/env";
import { db } from "@/lib/server/db";
import { spotifyEpisodes, spotifySearchShow } from "@/lib/server/providers/spotify";
import { recentUploads, resolveChannel, searchChannels, type Quota } from "@/lib/server/providers/youtube";
import type { PodcastRow } from "@/lib/server/sources";

/**
 * Weekly auto-discovery (Aditya, 12 Oct 2026): for shows missing a YouTube channel or Spotify id,
 * search once a week and accept a candidate ONLY if its recent episodes match the show's own
 * RSS episode titles (prevents look-alike channels such as an unrelated "Neon Show").
 */
const WEEK = 6 * 86_400_000;

async function rssTitles(podcastId: string): Promise<string[]> {
  const { data } = await db().from("episodes").select("title").eq("podcast_id", podcastId).order("published_at", { ascending: false }).limit(25);
  return (data ?? []).map((e) => e.title);
}

const overlap = (a: string[], b: string[]) => a.filter((x) => b.some((y) => titlesMatch(x, y))).length;

export async function discoverSources(p: PodcastRow, budget: { youtube: Quota; spotifyLeft: number }, log: (m: string) => void) {
  const cp = (p.checkpoint ?? {}) as { discovery_at?: string };
  if (cp.discovery_at && Date.now() - Date.parse(cp.discovery_at) < WEEK) return;
  const titles = await rssTitles(p.id);
  if (titles.length < 2) return; // nothing to verify against
  const patch: Record<string, unknown> = {};
  const name = p.name.replace(/\(.*?\)/g, "").trim();

  const ytKey = env().YOUTUBE_API_KEY;
  if (ytKey && !p.youtube_channel_id && !p.youtube_handle) {
    try {
      for (const hit of await searchChannels(`${name} podcast`, ytKey, budget.youtube, 4)) {
        const ch = await resolveChannel({ id: hit.id }, ytKey, budget.youtube);
        if (!ch) continue;
        const vids = await recentUploads(ch, new Date(Date.now() - 120 * 86_400_000), ytKey, budget.youtube);
        const n = overlap(titles, vids.map((v) => v.title));
        if (n >= 2) {
          patch.youtube_channel_id = ch.id;
          log(`${p.name}: discovered YouTube channel "${ch.title}" (${n} episodes match the RSS feed)`);
          break;
        }
      }
      if (!patch.youtube_channel_id) log(`${p.name}: no YouTube channel matched the RSS episodes`);
    } catch (e) {
      log(`${p.name}: YouTube discovery skipped (${e instanceof Error ? e.message : e})`);
    }
  }

  const rapid = env().RAPIDAPI_KEY;
  if (rapid && !p.spotify_show_id && budget.spotifyLeft >= 2) {
    try {
      const cfg = { key: rapid, host: env().RAPIDAPI_SPOTIFY_HOST };
      budget.spotifyLeft -= 1;
      const hits = await spotifySearchShow(name, cfg);
      const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
      const cand = hits.find((h) => norm(h.name).includes(norm(name)) || norm(name).includes(norm(h.name)));
      if (cand) {
        budget.spotifyLeft -= 1;
        const eps = await spotifyEpisodes(cand.id, cfg, { requests: 0 });
        const n = overlap(titles, eps.map((e) => e.title));
        if (n >= 2) {
          patch.spotify_show_id = cand.id;
          log(`${p.name}: discovered Spotify show "${cand.name}" (${n} episodes match)`);
        } else log(`${p.name}: Spotify candidate "${cand.name}" rejected (episodes don't match the RSS feed)`);
      }
    } catch (e) {
      log(`${p.name}: Spotify discovery skipped (${e instanceof Error ? e.message : e})`);
    }
  }

  await db().from("podcasts").update({ ...patch, checkpoint: { ...cp, discovery_at: new Date().toISOString() } }).eq("id", p.id);
  Object.assign(p, patch);
}
