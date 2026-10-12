import "server-only";
import { z } from "zod";
import { fetchRetry, HttpError } from "@/lib/server/http";

/**
 * RapidAPI "Spotify Scraper" (DataFanatic, BASIC $0 plan) — SECONDARY, metadata/description only.
 * Unofficial API: every call is optional; failures/quota never break a run. Never downloads audio.
 * Verified 11 Oct 2026: GET /v1/podcast/episodes?showId=… returns title, description, date, durationMs
 * (see docs/DATA_SOURCES.md). BASIC plan = 150 requests / month → budgeted via SPOTIFY_MONTHLY_BUDGET.
 */
export const SPOTIFY_EPISODES_PATH = "/v1/podcast/episodes";

export type SpotifyEpisode = {
  id: string;
  title: string;
  description: string;
  publishedAt: string;
  durationS: number | null;
  url: string;
};

const episodeSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    htmlDescription: z.string().optional(),
    releaseDate: z.union([z.string(), z.object({ isoString: z.string().optional(), date: z.string().optional() })]).optional(),
    date: z.string().optional(),
    durationMs: z.number().optional(),
    duration: z.union([z.number(), z.object({ totalMilliseconds: z.number().optional() })]).optional(),
  })
  .passthrough();

/** Extract an episode list from the (loosely documented) response shape. */
export function parseSpotifyEpisodes(json: unknown): SpotifyEpisode[] {
  const root = json as Record<string, unknown>;
  const list =
    (root?.episodes as { items?: unknown[] } | undefined)?.items ??
    (root?.episodes as unknown[] | undefined) ??
    (root?.items as unknown[] | undefined) ??
    ((root?.data as Record<string, unknown> | undefined)?.episodes as unknown[] | undefined) ??
    [];
  if (!Array.isArray(list)) return [];
  const out: SpotifyEpisode[] = [];
  for (const raw of list) {
    const ok = episodeSchema.safeParse(raw);
    if (!ok.success) continue;
    const e = ok.data;
    const rd = typeof e.releaseDate === "string" ? e.releaseDate : e.releaseDate?.isoString ?? e.releaseDate?.date ?? e.date;
    const d = rd ? new Date(rd) : null;
    if (!d || Number.isNaN(d.getTime())) continue;
    const ms = e.durationMs ?? (typeof e.duration === "number" ? e.duration : e.duration?.totalMilliseconds);
    out.push({
      id: e.id,
      title: e.name,
      description: (e.description ?? e.htmlDescription ?? "").replace(/<[^>]+>/g, " ").trim(),
      publishedAt: d.toISOString(),
      durationS: ms ? Math.round(ms / 1000) : null,
      url: `https://open.spotify.com/episode/${e.id}`,
    });
  }
  return out;
}

export function parseSpotifyShowId(input: string): string | null {
  const m = /show[/:]([A-Za-z0-9]{22})/.exec(input) ?? /^([A-Za-z0-9]{22})$/.exec(input.trim());
  return m ? m[1] : null;
}

export class SpotifyQuotaError extends Error {}

export async function spotifyEpisodes(
  showId: string,
  cfg: { key: string; host: string },
  counter: { requests: number },
): Promise<SpotifyEpisode[]> {
  const url = `https://${cfg.host}${SPOTIFY_EPISODES_PATH}?showId=${encodeURIComponent(showId)}`;
  counter.requests += 1;
  try {
    const res = await fetchRetry(url, {
      headers: { "X-RapidAPI-Key": cfg.key, "X-RapidAPI-Host": cfg.host },
      retries: 0,
      label: "spotify-scraper",
    });
    if (res.status === 403 || res.status === 401) throw new Error(`Spotify Scraper ${res.status} (subscription/key)`);
    if (!res.ok) throw new Error(`Spotify Scraper ${res.status}`);
    return parseSpotifyEpisodes(await res.json());
  } catch (e) {
    if (e instanceof HttpError && e.status === 429) throw new SpotifyQuotaError("Spotify Scraper quota/rate limit (429)");
    throw e;
  }
}

export const SPOTIFY_SEARCH_PATH = "/v1/search";

/** Find a show id by name (Settings helper / seed). Costs 1 request. */
export async function spotifySearchShow(term: string, cfg: { key: string; host: string }): Promise<{ id: string; name: string; publisher: string | null }[]> {
  const res = await fetchRetry(`https://${cfg.host}${SPOTIFY_SEARCH_PATH}?term=${encodeURIComponent(term)}&type=podcast`, {
    headers: { "X-RapidAPI-Key": cfg.key, "X-RapidAPI-Host": cfg.host },
    retries: 0,
    label: "spotify-scraper",
  });
  if (!res.ok) throw new Error(`Spotify Scraper search ${res.status}`);
  const j = (await res.json()) as { podcasts?: { items?: { id: string; name: string; publisher?: { name?: string } }[] } };
  return (j.podcasts?.items ?? []).map((x) => ({ id: x.id, name: x.name, publisher: x.publisher?.name ?? null }));
}
