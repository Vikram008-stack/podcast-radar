import "server-only";
import type { EpisodeRef } from "@/lib/shared/types";
import { titlesMatch } from "@/lib/text";
import { db, ownerId } from "@/lib/server/db";

export type ListenLink = { label: "Spotify" | "Apple Podcasts" | "YouTube" | "Episode page"; url: string };

type AppleEp = { title: string; url: string };

/** Recent Apple Podcasts episodes for a show (free iTunes Lookup, cached for a day). */
async function appleEpisodes(collectionId: string): Promise<AppleEp[]> {
  try {
    const res = await fetch(`https://itunes.apple.com/lookup?id=${encodeURIComponent(collectionId)}&entity=podcastEpisode&country=in&limit=60`, {
      next: { revalidate: 86_400 },
    });
    if (!res.ok) return [];
    const j = (await res.json()) as { results?: { wrapperType?: string; kind?: string; trackName?: string; trackViewUrl?: string }[] };
    return (j.results ?? [])
      .filter((r) => r.kind === "podcast-episode" && r.trackName && r.trackViewUrl)
      .map((r) => ({ title: r.trackName!, url: r.trackViewUrl! }));
  } catch {
    return [];
  }
}

/**
 * Listen links per episode, preferring Spotify and Apple Podcasts, then YouTube, then the
 * publisher's episode page. Apple links are matched by title; otherwise the show's Apple page.
 */
export async function listenLinks(episodes: EpisodeRef[]): Promise<Record<string, ListenLink[]>> {
  const owner = await ownerId();
  const podIds = [...new Set(episodes.map((e) => e.podcastId))];
  const { data } = await db().from("podcasts").select("id,apple_collection_id").eq("owner_id", owner).in("id", podIds);
  const appleId = new Map((data ?? []).filter((p) => p.apple_collection_id).map((p) => [p.id as string, p.apple_collection_id as string]));
  const appleByShow = new Map<string, AppleEp[]>();
  await Promise.all([...new Set(appleId.values())].map(async (id) => appleByShow.set(id, await appleEpisodes(id))));

  const out: Record<string, ListenLink[]> = {};
  for (const e of episodes) {
    const links: ListenLink[] = [];
    const spotify = e.links.find((l) => l.provider === "spotify")?.url;
    if (spotify) links.push({ label: "Spotify", url: spotify });
    const aid = appleId.get(e.podcastId);
    if (aid) {
      const hit = appleByShow.get(aid)?.find((a) => titlesMatch(a.title, e.title));
      links.push({ label: "Apple Podcasts", url: hit?.url ?? `https://podcasts.apple.com/in/podcast/id${aid}` });
    }
    const yt = e.links.find((l) => l.provider === "youtube")?.url;
    if (yt) links.push({ label: "YouTube", url: yt });
    if (!links.length && e.url) links.push({ label: "Episode page", url: e.url });
    out[e.id] = links;
  }
  return out;
}
