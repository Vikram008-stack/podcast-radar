import { titlesMatch } from "@/lib/text";

/**
 * Cross-platform dedupe: the same episode can appear on RSS, YouTube and Spotify.
 * Merge when titles are a normalised close match AND publish dates are within 3 days.
 */
export const DEDUPE_WINDOW_MS = 3 * 86_400_000;

export type DedupeCandidate = { title: string; publishedAt: string };

export function sameEpisode(a: DedupeCandidate, b: DedupeCandidate): boolean {
  const dt = Math.abs(new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime());
  return dt <= DEDUPE_WINDOW_MS && titlesMatch(a.title, b.title);
}

export function findMatch<T extends DedupeCandidate>(item: DedupeCandidate, existing: T[]): T | null {
  return existing.find((e) => sameEpisode(item, e)) ?? null;
}
