import "server-only";
import type { Facts } from "@/lib/metrics";
import type { EvidenceType, SponsorClass } from "@/lib/shared/types";
import { db, must } from "@/lib/server/db";
import type { Period } from "@/lib/time";

const chunk = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

async function inChunks<T>(ids: string[], q: (part: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, what: string): Promise<T[]> {
  const out: T[] = [];
  for (const part of chunk(ids, 120)) out.push(...(must(await q(part), what) ?? []));
  return out;
}

/** Load every fact needed for a period's metrics (30-day + previous-week windows). */
export async function loadFacts(owner: string, period: Period, isSample = false): Promise<Facts & { podcastNames: Map<string, string> }> {
  const sb = db();
  const from = new Date(Math.min(period.start30.getTime(), period.prevStart.getTime())).toISOString();
  const podcasts = must(await sb.from("podcasts").select("id,name,artwork_url").eq("owner_id", owner).eq("is_sample", isSample), "podcasts") ?? [];
  const names = new Map(podcasts.map((p) => [p.id, p.name as string]));
  const art = new Map(podcasts.map((p) => [p.id, p.artwork_url as string | null]));
  const eps = (must(
    await sb
      .from("episodes")
      .select("id,podcast_id,title,published_at,episode_url,thumbnail_url,duration_s,stats,stats_collected_at,episode_sources(provider,url)")
      .eq("owner_id", owner)
      .eq("is_sample", isSample)
      .gte("published_at", from)
      .lte("published_at", period.end.toISOString())
      .limit(5000),
    "episodes",
  ) ?? []) as {
    id: string;
    podcast_id: string;
    title: string;
    published_at: string;
    episode_url: string | null;
    thumbnail_url: string | null;
    duration_s: number | null;
    stats: { views?: number | null; likes?: number | null } | null;
    stats_collected_at: string | null;
    episode_sources: { provider: "rss" | "youtube" | "spotify"; url: string | null }[];
  }[];
  const episodes = eps
    .filter((e) => names.has(e.podcast_id))
    .map((e) => ({
      id: e.id,
      title: e.title,
      podcastId: e.podcast_id,
      podcastName: names.get(e.podcast_id)!,
      publishedAt: e.published_at,
      url: e.episode_url ?? e.episode_sources.find((s) => s.url)?.url ?? null,
      links: e.episode_sources.filter((s) => !!s.url).map((s) => ({ provider: s.provider, url: s.url! })),
      thumbnail: e.thumbnail_url ?? art.get(e.podcast_id) ?? null,
      durationS: e.duration_s,
      stats: e.stats ? { views: e.stats.views ?? null, likes: e.stats.likes ?? null, collectedAt: e.stats_collected_at } : null,
    }));
  const epIds = episodes.map((e) => e.id);

  const apps = await inChunks(
    epIds,
    (part) =>
      sb
        .from("guest_appearances")
        .select("guest_id,episode_id,evidence_excerpt,evidence_url,evidence_type,audio_timestamp_s,role_as_stated,confidence")
        .in("episode_id", part) as unknown as PromiseLike<{ data: { guest_id: string; episode_id: string; evidence_excerpt: string; evidence_url: string | null; evidence_type: EvidenceType; audio_timestamp_s: number | null; role_as_stated: string | null; confidence: number }[] | null; error: { message: string } | null }>,
    "appearances",
  );
  const guestIds = [...new Set(apps.map((a) => a.guest_id))];
  const guests = await inChunks(guestIds, (part) => sb.from("guests").select("id,name,role,company,review_status,profile_urls").in("id", part) as unknown as PromiseLike<{ data: { id: string; name: string; role: string | null; company: string | null; review_status: "ok" | "needs_review"; profile_urls: string[] | null }[] | null; error: { message: string } | null }>, "guests");
  const aliases = await inChunks(guestIds, (part) => sb.from("guest_aliases").select("guest_id,alias").in("guest_id", part) as unknown as PromiseLike<{ data: { guest_id: string; alias: string }[] | null; error: { message: string } | null }>, "aliases");

  const ets = await inChunks(epIds, (part) => sb.from("episode_topics").select("episode_id,topic_id").in("episode_id", part) as unknown as PromiseLike<{ data: { episode_id: string; topic_id: string }[] | null; error: { message: string } | null }>, "episode_topics");
  const topics = must(await sb.from("topics").select("id,slug,name,category").eq("owner_id", owner), "topics") ?? [];

  const pls = await inChunks(
    epIds,
    (part) =>
      sb
        .from("sponsorship_placements")
        .select("id,brand_id,episode_id,classification,confidence,detected_at,placement_evidence(evidence_type,excerpt,source_url,audio_timestamp_s)")
        .in("episode_id", part) as unknown as PromiseLike<{ data: { id: string; brand_id: string; episode_id: string; classification: SponsorClass; confidence: number; detected_at: string; placement_evidence: { evidence_type: EvidenceType; excerpt: string; source_url: string | null; audio_timestamp_s: number | null }[] }[] | null; error: { message: string } | null }>,
    "placements",
  );
  const brandIds = [...new Set(pls.map((p) => p.brand_id))];
  const brands = await inChunks(brandIds, (part) => sb.from("brands").select("id,name").in("id", part) as unknown as PromiseLike<{ data: { id: string; name: string }[] | null; error: { message: string } | null }>, "brands");

  const news = (must(
    await sb.from("news_articles").select("id,publisher,title,url,published_at,news_topics(topic_id)").eq("owner_id", owner).gte("published_at", period.prevStart.toISOString()).lte("published_at", period.end.toISOString()).limit(2000),
    "news",
  ) ?? []) as { id: string; publisher: string; title: string; url: string; published_at: string; news_topics: { topic_id: string }[] }[];

  return {
    podcastNames: names,
    episodes,
    guests: guests.map((g) => ({ id: g.id, name: g.name, role: g.role, company: g.company, links: g.profile_urls ?? [], reviewStatus: g.review_status, aliases: aliases.filter((a) => a.guest_id === g.id).map((a) => a.alias) })),
    appearances: apps.map((a) => ({
      guestId: a.guest_id,
      episodeId: a.episode_id,
      evidence: { type: a.evidence_type, excerpt: a.evidence_excerpt, url: a.evidence_url, audioTimestampS: a.audio_timestamp_s },
      roleAsStated: a.role_as_stated,
      confidence: a.confidence,
    })),
    topics,
    episodeTopics: ets.map((x) => ({ episodeId: x.episode_id, topicId: x.topic_id })),
    brands,
    placements: pls.map((p) => ({
      brandId: p.brand_id,
      episodeId: p.episode_id,
      classification: p.classification,
      confidence: p.confidence,
      detectedAt: p.detected_at,
      evidence: p.placement_evidence.map((e) => ({ type: e.evidence_type, excerpt: e.excerpt, url: e.source_url, audioTimestampS: e.audio_timestamp_s })),
    })),
    news: news.map((n) => ({ id: n.id, publisher: n.publisher, title: n.title, url: n.url, publishedAt: n.published_at, topicIds: n.news_topics.map((t) => t.topic_id) })),
  };
}
