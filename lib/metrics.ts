import type {
  EpisodeRef,
  Evidence,
  GuestSignal,
  NewsRef,
  Placement,
  SponsorClass,
  SponsorSignal,
  TopicSignal,
} from "@/lib/shared/types";
import type { Period } from "@/lib/time";

/**
 * Deterministic metrics & ranking (documented in docs/METRICS.md).
 * Guests (30d):   distinct shows ↓ → appearances ↓ → latest appearance ↓ → name
 * Topics (7d):    distinct shows ↓ → episodes ↓ → change ↓ ("New" ranks above any finite change)
 * Sponsors (30d): distinct shows ↓ → confirmed placements ↓ → latest ↓  (confirmed only)
 * Featured eligibility: guests ≥ 1 show (Aditya’s rule, 12 Oct 2026); topics ≥ 2 shows.
 */

export type EpisodeFact = EpisodeRef & { stats: { views: number | null; likes: number | null; collectedAt: string | null } | null };
export type GuestFact = { id: string; name: string; role: string | null; company: string | null; aliases: string[]; links?: string[]; reviewStatus: "ok" | "needs_review" };
export type AppearanceFact = { guestId: string; episodeId: string; evidence: Evidence; roleAsStated: string | null; confidence: number };
export type TopicFact = { id: string; slug: string; name: string; category: string | null };
export type PlacementFact = { brandId: string; episodeId: string; classification: SponsorClass; confidence: number; evidence: Evidence[]; detectedAt: string };
export type BrandFact = { id: string; name: string };
export type NewsFact = NewsRef & { topicIds: string[] };

export type Facts = {
  episodes: EpisodeFact[];
  guests: GuestFact[];
  appearances: AppearanceFact[];
  topics: TopicFact[];
  episodeTopics: { episodeId: string; topicId: string }[];
  brands: BrandFact[];
  placements: PlacementFact[];
  news: NewsFact[];
};

const t = (d: string) => new Date(d).getTime();
const within = (d: string, from: Date, to: Date) => t(d) >= from.getTime() && t(d) <= to.getTime();

function ref(e: EpisodeFact): EpisodeRef {
  const { stats: _stats, ...rest } = e;
  void _stats;
  return rest;
}

/** Topics need cross-show coverage to be a "wave". */
export const FEATURED_MIN_SHOWS = 2;
/** Guests: any evidenced appearance in 30 days qualifies; ranking still favours multi-show guests. */
export const GUEST_FEATURED_MIN_SHOWS = 1;

export function rankGuests(f: Facts, p: Period): GuestSignal[] {
  const eps = new Map(f.episodes.map((e) => [e.id, e]));
  const topicsByEp = topicSlugsByEpisode(f);
  const byGuest = new Map<string, AppearanceFact[]>();
  for (const a of f.appearances) {
    const e = eps.get(a.episodeId);
    if (!e || !within(e.publishedAt, p.start30, p.end)) continue;
    (byGuest.get(a.guestId) ?? byGuest.set(a.guestId, []).get(a.guestId)!).push(a);
  }
  const out: GuestSignal[] = [];
  for (const g of f.guests) {
    const apps = byGuest.get(g.id);
    if (!apps?.length) continue;
    const history = apps
      .map((a) => {
        const e = eps.get(a.episodeId)!;
        return { episode: ref(e), evidence: a.evidence, roleAsStated: a.roleAsStated, confidence: a.confidence, topics: topicsByEp.get(e.id) ?? [] };
      })
      .sort((x, y) => t(y.episode.publishedAt) - t(x.episode.publishedAt));
    const shows = [...new Set(history.map((h) => h.episode.podcastName))];
    const dates = history.map((h) => h.episode.publishedAt).sort();
    out.push({
      id: g.id,
      name: g.name,
      role: g.role,
      company: g.company,
      aliases: g.aliases,
      links: g.links ?? [],
      reviewStatus: g.reviewStatus,
      distinctShows: new Set(history.map((h) => h.episode.podcastId)).size,
      appearances: history.length,
      firstAppearance: dates[0],
      latestAppearance: dates[dates.length - 1],
      shows,
      history,
      talkingPoints: [],
      rank: 0,
    });
  }
  out.sort(
    (a, b) =>
      b.distinctShows - a.distinctShows ||
      b.appearances - a.appearances ||
      t(b.latestAppearance) - t(a.latestAppearance) ||
      a.name.localeCompare(b.name),
  );
  out.forEach((g, i) => (g.rank = i + 1));
  return out;
}

function topicSlugsByEpisode(f: Facts): Map<string, string[]> {
  const slug = new Map(f.topics.map((x) => [x.id, x.slug]));
  const m = new Map<string, string[]>();
  for (const et of f.episodeTopics) {
    const s = slug.get(et.topicId);
    if (!s) continue;
    (m.get(et.episodeId) ?? m.set(et.episodeId, []).get(et.episodeId)!).push(s);
  }
  return m;
}

/** (current − previous) / previous; null when previous = 0 (shown as "New"). */
export function topicChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return (current - previous) / previous;
}

export function rankTopics(f: Facts, p: Period): TopicSignal[] {
  const eps = new Map(f.episodes.map((e) => [e.id, e]));
  const out: TopicSignal[] = [];
  for (const topic of f.topics) {
    const epIds = f.episodeTopics.filter((x) => x.topicId === topic.id).map((x) => x.episodeId);
    const cur = epIds.map((id) => eps.get(id)).filter((e): e is EpisodeFact => !!e && within(e.publishedAt, p.start, p.end));
    if (!cur.length) continue;
    const prev = epIds
      .map((id) => eps.get(id))
      .filter((e): e is EpisodeFact => !!e && t(e.publishedAt) >= p.prevStart.getTime() && t(e.publishedAt) < p.start.getTime());
    const news = f.news
      .filter((n) => n.topicIds.includes(topic.id) && within(n.publishedAt, p.prevStart, p.end))
      .sort((a, b) => t(b.publishedAt) - t(a.publishedAt))
      .slice(0, 6)
      .map(({ topicIds: _ids, ...n }) => {
        void _ids;
        return n;
      });
    const sorted = [...cur].sort((a, b) => t(b.publishedAt) - t(a.publishedAt));
    out.push({
      id: topic.id,
      slug: topic.slug,
      name: topic.name,
      category: topic.category,
      episodes: cur.length,
      distinctShows: new Set(cur.map((e) => e.podcastId)).size,
      previousEpisodes: prev.length,
      change: topicChange(cur.length, prev.length),
      shows: [...new Set(sorted.map((e) => e.podcastName))],
      referenceEpisodes: sorted.map(ref),
      news,
      angles: [],
      audienceResponse: sorted
        .filter((e) => e.stats && (e.stats.views !== null || e.stats.likes !== null))
        .map((e) => ({ episodeId: e.id, title: e.title, views: e.stats!.views, likes: e.stats!.likes, collectedAt: e.stats!.collectedAt })),
      rank: 0,
    });
  }
  const ch = (c: number | null) => (c === null ? Number.POSITIVE_INFINITY : c);
  out.sort((a, b) => b.distinctShows - a.distinctShows || b.episodes - a.episodes || ch(b.change) - ch(a.change) || a.name.localeCompare(b.name));
  out.forEach((x, i) => (x.rank = i + 1));
  return out;
}

export function rankSponsors(f: Facts, p: Period): { sponsors: SponsorSignal[]; others: SponsorSignal[] } {
  const eps = new Map(f.episodes.map((e) => [e.id, e]));
  const sponsors: SponsorSignal[] = [];
  const others: SponsorSignal[] = [];
  for (const b of f.brands) {
    const pls = f.placements.filter((x) => x.brandId === b.id && x.classification !== "related_party" && x.classification !== "organic");
    const inWin = pls
      .map((x) => ({ x, e: eps.get(x.episodeId) }))
      .filter((y): y is { x: PlacementFact; e: EpisodeFact } => !!y.e && within(y.e.publishedAt, p.start30, p.end))
      .sort((a, c) => t(c.e.publishedAt) - t(a.e.publishedAt));
    if (!inWin.length) continue;
    const confirmed = inWin.filter((y) => y.x.classification === "confirmed");
    const counted = confirmed.length ? confirmed : inWin;
    const placements: Placement[] = inWin.map(({ x, e }) => ({
      episode: ref(e),
      classification: x.classification,
      confidence: x.confidence,
      evidence: x.evidence,
      stats: e.stats,
      detectedAt: x.detectedAt,
    }));
    const sig: SponsorSignal = {
      id: b.id,
      name: b.name,
      confirmed: confirmed.length,
      affiliate: inWin.filter((y) => y.x.classification === "affiliate").length,
      probable: inWin.filter((y) => y.x.classification === "probable").length,
      distinctShows: new Set(counted.map((y) => y.e.podcastId)).size,
      distinctEpisodes: new Set(counted.map((y) => y.e.id)).size,
      latestPlacement: counted[0]?.e.publishedAt ?? null,
      shows: [...new Set(counted.map((y) => y.e.podcastName))],
      placements,
      fit: [],
      rank: 0,
    };
    (confirmed.length ? sponsors : others).push(sig);
  }
  const cmp = (a: SponsorSignal, b: SponsorSignal) =>
    b.distinctShows - a.distinctShows ||
    b.confirmed - a.confirmed ||
    t(b.latestPlacement ?? "1970") - t(a.latestPlacement ?? "1970") ||
    a.name.localeCompare(b.name);
  sponsors.sort(cmp);
  others.sort((a, b) => b.distinctShows - a.distinctShows || b.affiliate + b.probable - (a.affiliate + a.probable) || cmp(a, b));
  sponsors.forEach((s, i) => (s.rank = i + 1));
  others.forEach((s, i) => (s.rank = sponsors.length + i + 1)); // one list: 1, 2, 3, 4…
  return { sponsors, others };
}

export function featured<T extends { distinctShows: number }>(list: T[], max = 3, minShows = FEATURED_MIN_SHOWS): T[] {
  return list.filter((x) => x.distinctShows >= minShows).slice(0, max);
}

export function featuredGuests<T extends { distinctShows: number }>(list: T[], max = 3): T[] {
  return featured(list, max, GUEST_FEATURED_MIN_SHOWS);
}

/** Top featured topic + top featured guest whose evidenced episodes carry that topic. */
export function pickOpportunity(guests: GuestSignal[], topics: TopicSignal[]) {
  const topic = topics[0] ?? null; // always the top-ranked topic (Aditya: no empty slots)
  if (!topic) return { topic: null, guest: null };
  const guest = featuredGuests(guests, Number.MAX_SAFE_INTEGER).find((g) => g.history.some((h) => h.topics.includes(topic.slug))) ?? null;
  return { topic, guest };
}
