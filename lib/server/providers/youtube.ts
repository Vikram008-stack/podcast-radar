import "server-only";
import { z } from "zod";
import { fetchRetry } from "@/lib/server/http";

/**
 * Official YouTube Data API v3. Never calls search.list (100 units).
 * channels.list = 1 unit, playlistItems.list = 1 unit, videos.list = 1 unit.
 * Captions of channels we don't own are not available — we use title, description, chapters.
 */
const API = "https://www.googleapis.com/youtube/v3";

export type Quota = { units: number };

const channelSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        snippet: z.object({ title: z.string(), thumbnails: z.record(z.string(), z.object({ url: z.string() })).optional() }),
        contentDetails: z.object({ relatedPlaylists: z.object({ uploads: z.string() }) }),
      }),
    )
    .optional(),
});

const playlistSchema = z.object({
  nextPageToken: z.string().optional(),
  items: z.array(
    z.object({
      contentDetails: z.object({ videoId: z.string(), videoPublishedAt: z.string().optional() }),
    }),
  ),
});

const videosSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      snippet: z.object({
        title: z.string(),
        description: z.string().default(""),
        publishedAt: z.string(),
        thumbnails: z.record(z.string(), z.object({ url: z.string() })).optional(),
        liveBroadcastContent: z.string().optional(),
      }),
      contentDetails: z.object({ duration: z.string() }),
      statistics: z
        .object({ viewCount: z.string().optional(), likeCount: z.string().optional(), commentCount: z.string().optional() })
        .optional(),
    }),
  ),
});

export type YtChannel = { id: string; title: string; uploadsPlaylist: string; thumbnail: string | null };
export type YtVideo = {
  id: string;
  title: string;
  description: string;
  publishedAt: string;
  durationS: number;
  thumbnail: string | null;
  url: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
};

/** ISO-8601 duration (PT1H2M3S) → seconds */
export function isoDurationToSeconds(iso: string): number {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!m) return 0;
  const [, d, h, mi, s] = m.map((x) => (x ? Number(x) : 0));
  return d * 86400 + h * 3600 + mi * 60 + s;
}

/** Accepts @handle, channel URL (/@handle, /channel/UC…), or a raw UC… id. */
export function parseChannelRef(input: string): { handle?: string; id?: string } | null {
  const s = input.trim();
  if (!s) return null;
  const idMatch = /(UC[\w-]{22})/.exec(s);
  if (idMatch) return { id: idMatch[1] };
  const h = /@([\w.\-]{3,100})/.exec(s);
  if (h) return { handle: h[1] };
  if (/^[\w.\-]{3,100}$/.test(s)) return { handle: s };
  return null;
}

async function call<T>(path: string, params: Record<string, string>, key: string, schema: z.ZodType<T>, quota: Quota) {
  const qs = new URLSearchParams({ ...params, key });
  const res = await fetchRetry(`${API}/${path}?${qs}`, { label: `youtube:${path}` });
  quota.units += 1;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const reason = (body as { error?: { errors?: { reason?: string }[]; message?: string } }).error;
    throw new Error(`YouTube ${path} ${res.status}: ${reason?.errors?.[0]?.reason ?? reason?.message ?? "error"}`);
  }
  return schema.parse(body);
}

export async function resolveChannel(ref: { handle?: string; id?: string }, key: string, quota: Quota): Promise<YtChannel | null> {
  const params: Record<string, string> = { part: "snippet,contentDetails" };
  if (ref.id) params.id = ref.id;
  else if (ref.handle) params.forHandle = ref.handle.startsWith("@") ? ref.handle : `@${ref.handle}`;
  else return null;
  const data = await call("channels", params, key, channelSchema, quota);
  const c = data.items?.[0];
  if (!c) return null;
  const th = c.snippet.thumbnails;
  return {
    id: c.id,
    title: c.snippet.title,
    uploadsPlaylist: c.contentDetails.relatedPlaylists.uploads,
    thumbnail: th?.high?.url ?? th?.medium?.url ?? th?.default?.url ?? null,
  };
}

/** Recent uploads (newest first) published at/after `since`, max ~100 items. */
export async function recentUploads(channel: YtChannel, since: Date, key: string, quota: Quota): Promise<YtVideo[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  // Shorts-heavy channels can bury full episodes, so read up to 4 pages (≤ 4 units).
  for (let page = 0; page < 4; page++) {
    const data = await call(
      "playlistItems",
      { part: "contentDetails", playlistId: channel.uploadsPlaylist, maxResults: "50", ...(pageToken ? { pageToken } : {}) },
      key,
      playlistSchema,
      quota,
    );
    let reachedOld = false;
    for (const it of data.items) {
      const at = it.contentDetails.videoPublishedAt;
      if (at && new Date(at) < since) {
        reachedOld = true;
        continue;
      }
      ids.push(it.contentDetails.videoId);
    }
    if (reachedOld || !data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
  return videoDetails(ids, key, quota);
}

export async function videoDetails(ids: string[], key: string, quota: Quota): Promise<YtVideo[]> {
  const out: YtVideo[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const data = await call(
      "videos",
      { part: "snippet,contentDetails,statistics", id: ids.slice(i, i + 50).join(",") },
      key,
      videosSchema,
      quota,
    );
    for (const v of data.items) {
      if (v.snippet.liveBroadcastContent && v.snippet.liveBroadcastContent !== "none") continue;
      const th = v.snippet.thumbnails;
      const num = (x?: string) => (x === undefined ? null : Number(x));
      out.push({
        id: v.id,
        title: v.snippet.title,
        description: v.snippet.description,
        publishedAt: v.snippet.publishedAt,
        durationS: isoDurationToSeconds(v.contentDetails.duration),
        thumbnail: th?.maxres?.url ?? th?.high?.url ?? th?.medium?.url ?? th?.default?.url ?? null,
        url: `https://www.youtube.com/watch?v=${v.id}`,
        views: num(v.statistics?.viewCount),
        likes: num(v.statistics?.likeCount),
        comments: num(v.statistics?.commentCount),
      });
    }
  }
  return out;
}

/** Shorts/clips filter: a video counts as an episode only if it is at least `minMinutes` long. */
export function isFullEpisode(durationS: number, minMinutes: number): boolean {
  return durationS >= minMinutes * 60;
}

const searchSchema = z.object({
  items: z.array(
    z.object({
      id: z.object({ channelId: z.string().optional() }),
      snippet: z.object({ channelTitle: z.string(), description: z.string().default(""), thumbnails: z.record(z.string(), z.object({ url: z.string() })).optional() }),
    }),
  ),
});

export type YtChannelHit = { id: string; title: string; description: string; thumbnail: string | null };

/** search.list (type=channel) — 100 units per call; used for Settings search + weekly discovery only. */
export async function searchChannels(q: string, key: string, quota: Quota, max = 5): Promise<YtChannelHit[]> {
  const data = await call("search", { part: "snippet", type: "channel", q, maxResults: String(max) }, key, searchSchema, quota);
  quota.units += 99; // search.list costs 100 units (call() already counted 1)
  return data.items
    .filter((i) => i.id.channelId)
    .map((i) => ({ id: i.id.channelId!, title: i.snippet.channelTitle, description: i.snippet.description, thumbnail: i.snippet.thumbnails?.high?.url ?? i.snippet.thumbnails?.default?.url ?? null }));
}
