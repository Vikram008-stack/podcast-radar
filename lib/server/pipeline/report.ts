import "server-only";
import { pickOpportunity, rankGuests, rankSponsors, rankTopics, type Facts } from "@/lib/metrics";
import type { AiClaim, ReportSnapshot, SourceHealth } from "@/lib/shared/types";
import type { Gemini } from "@/lib/server/ai/gemini";
import { GeminiUnavailable } from "@/lib/server/ai/gemini";
import { BRIEF_SYSTEM, BRIEF_VERSION, briefParts, briefSchema } from "@/lib/server/ai/prompts/brief";
import type { Period } from "@/lib/time";

/** Drop claims whose source_ids are missing or not in the payload. */
export function keepSourced(claims: AiClaim[], valid: Set<string>): AiClaim[] {
  return claims
    .map((c) => ({ ...c, source_ids: c.source_ids.filter((s) => valid.has(s)) }))
    .filter((c) => c.source_ids.length > 0);
}

export function buildSnapshot(facts: Facts, period: Period, sources: SourceHealth[], extra: { isSample: boolean; aiCalls: number; audioAnalysed: number; audioSkipped: number; notes: string[] }): ReportSnapshot {
  const guests = rankGuests(facts, period);
  const topics = rankTopics(facts, period);
  const { sponsors, others } = rankSponsors(facts, period);
  const opp = pickOpportunity(guests, topics);
  const in30 = facts.episodes.filter((e) => +new Date(e.publishedAt) >= +period.start30 && +new Date(e.publishedAt) <= +period.end).length;
  const in7 = facts.episodes.filter((e) => +new Date(e.publishedAt) >= +period.start && +new Date(e.publishedAt) <= +period.end).length;
  const oppSources: { label: string; url: string }[] = [];
  if (opp.topic) for (const e of opp.topic.referenceEpisodes.slice(0, 3)) if (e.url) oppSources.push({ label: `${e.podcastName}: ${e.title}`, url: e.url });
  if (opp.guest) for (const h of opp.guest.history.slice(0, 2)) if (h.evidence.url) oppSources.push({ label: `${h.episode.podcastName}: ${h.episode.title}`, url: h.evidence.url });
  return {
    schema: 1,
    periodStart: period.start.toISOString(),
    periodEnd: period.end.toISOString(),
    window30Start: period.start30.toISOString(),
    prevStart: period.prevStart.toISOString(),
    generatedAt: new Date().toISOString(),
    isSample: extra.isSample,
    sources,
    sourcesCollected: sources.filter((s) => s.status === "ok" || s.status === "partial").length,
    sourcesTotal: sources.filter((s) => s.status !== "inactive").length,
    guests,
    topics,
    sponsors,
    otherBrands: others,
    opportunity: {
      topic: opp.topic ? { id: opp.topic.id, name: opp.topic.name, distinctShows: opp.topic.distinctShows, episodes: opp.topic.episodes } : null,
      guest: opp.guest ? { id: opp.guest.id, name: opp.guest.name, distinctShows: opp.guest.distinctShows } : null,
      copy: [],
      sources: oppSources,
    },
    stats: { episodesIn30d: in30, episodesIn7d: in7, audioAnalysed: extra.audioAnalysed, audioSkipped: extra.audioSkipped, newsArticles: facts.news.length, aiCalls: extra.aiCalls },
    notes: extra.notes,
  };
}

/** One Gemini call writes all labelled AI copy; every claim must cite payload ids. */
export async function addBriefCopy(snap: ReportSnapshot, gemini: Gemini | null, log: (m: string) => void): Promise<void> {
  if (!gemini) {
    snap.notes.push("AI copy unavailable (no Gemini key).");
    return;
  }
  const valid = new Set<string>();
  const ep = (id: string) => {
    valid.add(`ep:${id}`);
    return `ep:${id}`;
  };
  const guests = snap.guests.slice(0, 3);
  const topics = snap.topics.slice(0, 3);
  const sponsors = [...snap.sponsors, ...snap.otherBrands].slice(0, 3);
  const oppTopic = snap.topics.find((t) => t.id === snap.opportunity.topic?.id);
  const oppGuest = snap.guests.find((g) => g.id === snap.opportunity.guest?.id);
  const payload = {
    period: { start: snap.periodStart.slice(0, 10), end: snap.periodEnd.slice(0, 10) },
    opportunity: oppTopic
      ? {
          topic: { name: oppTopic.name, episodes: oppTopic.episodes, distinct_shows: oppTopic.distinctShows, change: oppTopic.change, reference_episodes: oppTopic.referenceEpisodes.slice(0, 4).map((e) => ({ id: ep(e.id), show: e.podcastName, title: e.title })) },
          guest: oppGuest ? { name: oppGuest.name, distinct_shows: oppGuest.distinctShows, appearances: oppGuest.history.slice(0, 3).map((h) => ({ id: ep(h.episode.id), show: h.episode.podcastName, title: h.episode.title })) } : null,
        }
      : null,
    guests: guests.map((g) => ({ guest_id: g.id, name: g.name, role: g.role, company: g.company, appearances: g.history.slice(0, 4).map((h) => ({ id: ep(h.episode.id), show: h.episode.podcastName, title: h.episode.title, evidence: h.evidence.excerpt })) })),
    topics: topics.map((t) => {
      for (const n of t.news) valid.add(`news:${n.id}`);
      return { topic_id: t.id, name: t.name, episodes: t.episodes, distinct_shows: t.distinctShows, previous_week_episodes: t.previousEpisodes, reference_episodes: t.referenceEpisodes.slice(0, 4).map((e) => ({ id: ep(e.id), show: e.podcastName, title: e.title })), news: t.news.slice(0, 4).map((n) => ({ id: `news:${n.id}`, publisher: n.publisher, title: n.title })) };
    }),
    sponsors: sponsors.map((s) => ({ sponsor_id: s.id, brand: s.name, confirmed_placements: s.confirmed, distinct_shows: s.distinctShows, shows: s.shows, placements: s.placements.slice(0, 4).map((p) => ({ id: ep(p.episode.id), show: p.episode.podcastName, title: p.episode.title, evidence: p.evidence[0]?.excerpt ?? "" })) })),
  };
  if (!payload.opportunity && !guests.length && !topics.length && !sponsors.length) return;
  try {
    const out = await gemini.json({ name: "brief", version: BRIEF_VERSION, system: BRIEF_SYSTEM, parts: briefParts(payload), schema: briefSchema });
    if (!out) {
      snap.notes.push("AI copy failed validation and was left out (needs review).");
      return;
    }
    if (oppTopic) snap.opportunity.copy = keepSourced(out.opportunity, valid).slice(0, 2);
    for (const k of out.guest_points) {
      const g = snap.guests.find((x) => x.id === k.id);
      if (g) g.talkingPoints = keepSourced(k.claims, valid);
    }
    for (const k of out.topic_swot) {
      const t = snap.topics.find((x) => x.id === k.id);
      if (t) t.swot = { strengths: keepSourced(k.strengths, valid), weaknesses: keepSourced(k.weaknesses, valid), opportunities: keepSourced(k.opportunities, valid), threats: keepSourced(k.threats, valid) };
    }
    for (const k of out.sponsor_fit) {
      const s = [...snap.sponsors, ...snap.otherBrands].find((x) => x.id === k.id);
      if (s) s.fit = keepSourced(k.claims, valid);
    }
  } catch (e) {
    const msg = e instanceof GeminiUnavailable ? "Gemini free-tier quota reached — AI copy skipped this week." : `AI copy failed: ${e instanceof Error ? e.message : String(e)}`;
    snap.notes.push(msg);
    log(msg);
  }
}
