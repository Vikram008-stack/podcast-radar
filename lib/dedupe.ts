import { titlesMatch } from "@/lib/text";

/**
 * Cross-platform dedupe: the same episode can appear on RSS, YouTube and Spotify.
 * Merge when publish dates are within 3 days AND either both titles carry the same
 * episode code (e.g. "FO572") or the titles are a normalised close match.
 * Shows often retitle the YouTube upload, so the episode code is the stronger signal.
 */
export const DEDUPE_WINDOW_MS = 3 * 86_400_000;

export type DedupeCandidate = { title: string; publishedAt: string };

/** Episode codes such as "FO572", "EP45", "#123" or "Ep. 45". */
export function episodeCodes(title: string): Set<string> {
  const out = new Set<string>();
  // Uploads sometimes swap the letter O for a zero ("F0572" vs "FO572").
  for (const m of title.matchAll(/\b([A-Z][A-Z0]{0,3})(\d{2,5})\b/g)) out.add(`${m[1].replace(/0/g, "O")}${m[2]}`);
  for (const m of title.matchAll(/\b(?:ep|episode)\.?\s?#?(\d{1,5})\b/gi)) out.add(`EP${m[1]}`);
  for (const m of title.matchAll(/#(\d{1,5})\b/g)) out.add(`EP${m[1]}`);
  return out;
}

export function sameEpisode(a: DedupeCandidate, b: DedupeCandidate): boolean {
  const dt = Math.abs(new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime());
  if (dt > DEDUPE_WINDOW_MS) return false;
  const ca = episodeCodes(a.title);
  const cb = episodeCodes(b.title);
  if (ca.size && cb.size) return [...ca].some((c) => cb.has(c));
  return titlesMatch(a.title, b.title);
}

export function findMatch<T extends DedupeCandidate>(item: DedupeCandidate, existing: T[]): T | null {
  return existing.find((e) => sameEpisode(item, e)) ?? null;
}
