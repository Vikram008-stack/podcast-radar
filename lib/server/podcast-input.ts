import "server-only";
import { z } from "zod";
import { parseChannelRef } from "@/lib/server/providers/youtube";
import { parseSpotifyShowId } from "@/lib/server/providers/spotify";

const names = z.array(z.string().trim().min(1).max(80)).max(20);

export const podcastCreate = z.object({
  name: z.string().trim().min(2).max(120),
  rss_url: z.string().url().max(500).nullable().optional(),
  youtube: z.string().max(200).nullable().optional(),
  spotify: z.string().max(200).nullable().optional(),
  host_names: names.default([]),
  house_brands: names.default([]),
  apple_collection_id: z.string().regex(/^\d+$/).nullable().optional(),
  artwork_url: z.string().url().max(500).nullable().optional(),
});

export const podcastPatch = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  rss_url: z.string().url().max(500).nullable().optional(),
  youtube: z.string().max(200).nullable().optional(),
  spotify: z.string().max(200).nullable().optional(),
  host_names: names.optional(),
  house_brands: names.optional(),
  analyse_audio: z.boolean().optional(),
  active: z.boolean().optional(),
  min_episode_minutes: z.number().int().min(1).max(240).nullable().optional(),
});

/** Maps form fields (youtube / spotify free text) onto DB columns. Throws on unparseable refs. */
export function toColumns(input: z.infer<typeof podcastPatch>) {
  const out: Record<string, unknown> = {};
  for (const k of ["name", "rss_url", "host_names", "house_brands", "analyse_audio", "active", "min_episode_minutes"] as const) {
    if (input[k] !== undefined) out[k] = input[k];
  }
  if (input.youtube !== undefined) {
    if (!input.youtube) {
      out.youtube_handle = null;
      out.youtube_channel_id = null;
    } else {
      const ref = parseChannelRef(input.youtube);
      if (!ref) throw new Error("Could not read that YouTube channel — paste a channel URL or @handle");
      out.youtube_handle = ref.handle ?? null;
      out.youtube_channel_id = ref.id ?? null;
    }
  }
  if (input.spotify !== undefined) {
    if (!input.spotify) out.spotify_show_id = null;
    else {
      const id = parseSpotifyShowId(input.spotify);
      if (!id) throw new Error("Could not read that Spotify show URL");
      out.spotify_show_id = id;
    }
  }
  return out;
}
