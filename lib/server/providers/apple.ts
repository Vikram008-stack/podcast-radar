import "server-only";
import { z } from "zod";
import { fetchRetry } from "@/lib/server/http";

const resultSchema = z.object({
  collectionId: z.number(),
  collectionName: z.string(),
  artistName: z.string().optional(),
  feedUrl: z.string().url().optional(),
  artworkUrl600: z.string().optional(),
  artworkUrl100: z.string().optional(),
  releaseDate: z.string().optional(),
  trackCount: z.number().optional(),
});
const responseSchema = z.object({ resultCount: z.number(), results: z.array(z.unknown()) });

export type AppleShow = {
  collectionId: string;
  name: string;
  artist: string | null;
  feedUrl: string | null;
  artwork: string | null;
  lastRelease: string | null;
  episodeCount: number | null;
};

export function parseAppleResults(json: unknown): AppleShow[] {
  const parsed = responseSchema.parse(json);
  const out: AppleShow[] = [];
  for (const r of parsed.results) {
    const ok = resultSchema.safeParse(r);
    if (!ok.success) continue;
    const x = ok.data;
    out.push({
      collectionId: String(x.collectionId),
      name: x.collectionName,
      artist: x.artistName ?? null,
      feedUrl: x.feedUrl ?? null,
      artwork: x.artworkUrl600 ?? x.artworkUrl100 ?? null,
      lastRelease: x.releaseDate ?? null,
      episodeCount: x.trackCount ?? null,
    });
  }
  return out;
}

/** iTunes Search (entity=podcast, country=in). No key. */
export async function searchApple(term: string, limit = 8): Promise<AppleShow[]> {
  const url = `https://itunes.apple.com/search?media=podcast&entity=podcast&country=in&limit=${limit}&term=${encodeURIComponent(term)}`;
  const res = await fetchRetry(url, { label: "apple-search" });
  if (!res.ok) throw new Error(`Apple search responded ${res.status}`);
  return parseAppleResults(await res.json());
}

export async function lookupApple(collectionId: string): Promise<AppleShow | null> {
  const res = await fetchRetry(`https://itunes.apple.com/lookup?id=${encodeURIComponent(collectionId)}&entity=podcast`, {
    label: "apple-lookup",
  });
  if (!res.ok) throw new Error(`Apple lookup responded ${res.status}`);
  return parseAppleResults(await res.json())[0] ?? null;
}
