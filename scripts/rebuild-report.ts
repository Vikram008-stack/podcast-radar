// Patch a frozen weekly snapshot after duplicate episodes were merged (scripts/merge-duplicates.ts):
// collapses each duplicate onto the kept episode and recounts — everything else stays frozen, no Gemini calls.
// Usage: npx tsx --conditions=react-server scripts/rebuild-report.ts [--apply] [YYYY-MM-DD period start]
import { config } from "dotenv";
config({ path: ".env.local" });

import type { AiClaim, EpisodeRef, ReportSnapshot } from "@/lib/shared/types";

async function main() {
  const apply = process.argv.includes("--apply");
  const day = process.argv.slice(2).find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
  const { db, must, ownerId } = await import("@/lib/server/db");
  const { reportingPeriod } = await import("@/lib/time");
  const { loadFacts } = await import("@/lib/server/pipeline/facts");
  const { buildSnapshot } = await import("@/lib/server/pipeline/report");
  const { sameEpisode } = await import("@/lib/dedupe");
  const { topicChange } = await import("@/lib/metrics");
  const sb = db();
  const owner = await ownerId();
  const period = reportingPeriod(day ? new Date(`${day}T12:00:00Z`) : new Date());
  const row = must(await sb.from("weekly_reports").select("id,status,version,snapshot").eq("owner_id", owner).eq("is_sample", false).eq("period_start", period.start.toISOString()).single(), "load report") as {
    id: string;
    status: string;
    version: number;
    snapshot: ReportSnapshot;
  };
  const old = row.snapshot;

  const facts = await loadFacts(owner, period);
  const snap = buildSnapshot(facts, period, old.sources, { isSample: false, aiCalls: old.stats.aiCalls, audioAnalysed: old.stats.audioAnalysed, audioSkipped: old.stats.audioSkipped, notes: old.notes });

  // Map citations of merged-away episodes onto the episode that was kept.
  const episodesOf = (s: ReportSnapshot): EpisodeRef[] => [...s.guests.flatMap((g) => g.history.map((h) => h.episode)), ...s.topics.flatMap((t) => t.referenceEpisodes), ...[...s.sponsors, ...s.otherBrands].flatMap((b) => b.placements.map((p) => p.episode))];
  const fresh = new Map(episodesOf(snap).map((e) => [e.id, e]));
  const remap = new Map<string, string>();
  for (const e of episodesOf(old)) {
    if (fresh.has(e.id) || remap.has(e.id)) continue;
    const kept = [...fresh.values()].find((f) => f.podcastName === e.podcastName && sameEpisode({ title: f.title, publishedAt: f.publishedAt }, { title: e.title, publishedAt: e.publishedAt }));
    if (kept) remap.set(e.id, kept.id);
  }
  const epFix = (e: EpisodeRef): EpisodeRef => fresh.get(remap.get(e.id) ?? e.id) ?? e; // shows removed since keep their frozen refs
  const uniq = <T,>(xs: T[], key: (x: T) => string) => xs.filter(((seen) => (x: T) => (seen.has(key(x)) ? false : (seen.add(key(x)), true)))(new Set<string>()));
  const fix = (cs: AiClaim[]): AiClaim[] => cs.map((c) => ({ ...c, source_ids: [...new Set(c.source_ids.map((s) => (s.startsWith("ep:") && remap.has(s.slice(3)) ? `ep:${remap.get(s.slice(3))}` : s)))] }));
  const ms = (d: string | null) => (d ? new Date(d).getTime() : 0);

  // Patch the frozen snapshot in place: only merged duplicates change, everything else stays as frozen.
  const out = structuredClone(old);
  for (const g of out.guests) {
    g.history = uniq(g.history.map((h) => ({ ...h, episode: epFix(h.episode) })), (h) => h.episode.id);
    const dates = g.history.map((h) => h.episode.publishedAt).sort();
    g.appearances = g.history.length;
    g.distinctShows = new Set(g.history.map((h) => h.episode.podcastId)).size;
    g.shows = [...new Set(g.history.map((h) => h.episode.podcastName))];
    g.firstAppearance = dates[0];
    g.latestAppearance = dates[dates.length - 1];
    g.talkingPoints = fix(g.talkingPoints);
  }
  out.guests.sort((a, b) => b.distinctShows - a.distinctShows || b.appearances - a.appearances || ms(b.latestAppearance) - ms(a.latestAppearance) || a.name.localeCompare(b.name));
  out.guests.forEach((g, i) => (g.rank = i + 1));

  const freshTopics = new Map(snap.topics.map((t) => [t.id, t]));
  for (const t of out.topics) {
    t.referenceEpisodes = uniq(t.referenceEpisodes.map(epFix), (e) => e.id);
    t.episodes = t.referenceEpisodes.length;
    t.distinctShows = new Set(t.referenceEpisodes.map((e) => e.podcastId)).size;
    t.shows = [...new Set(t.referenceEpisodes.map((e) => e.podcastName))];
    const prev = freshTopics.get(t.id)?.previousEpisodes;
    if (prev !== undefined && prev < t.previousEpisodes) t.previousEpisodes = prev;
    t.change = topicChange(t.episodes, t.previousEpisodes);
    t.audienceResponse = uniq(t.audienceResponse.map((a) => ({ ...a, episodeId: remap.get(a.episodeId) ?? a.episodeId })), (a) => a.episodeId);
    t.angles = fix(t.angles);
    if (t.swot) t.swot = { strengths: fix(t.swot.strengths), weaknesses: fix(t.swot.weaknesses), opportunities: fix(t.swot.opportunities), threats: fix(t.swot.threats) };
  }
  const ch = (c: number | null) => (c === null ? Number.POSITIVE_INFINITY : c);
  out.topics.sort((a, b) => b.distinctShows - a.distinctShows || b.episodes - a.episodes || ch(b.change) - ch(a.change) || a.name.localeCompare(b.name));
  out.topics.forEach((t, i) => (t.rank = i + 1));

  const strength = { confirmed: 3, affiliate: 2, probable: 1 } as Record<string, number>;
  const brands = [...out.sponsors, ...out.otherBrands];
  for (const b of brands) {
    const pls = b.placements.map((p) => ({ ...p, episode: epFix(p.episode) })).sort((x, y) => (strength[y.classification] ?? 0) - (strength[x.classification] ?? 0));
    b.placements = uniq(pls, (p) => p.episode.id).sort((x, y) => ms(y.episode.publishedAt) - ms(x.episode.publishedAt));
    const confirmed = b.placements.filter((p) => p.classification === "confirmed");
    const counted = confirmed.length ? confirmed : b.placements;
    b.confirmed = confirmed.length;
    b.affiliate = b.placements.filter((p) => p.classification === "affiliate").length;
    b.probable = b.placements.filter((p) => p.classification === "probable").length;
    b.distinctShows = new Set(counted.map((p) => p.episode.podcastId)).size;
    b.distinctEpisodes = new Set(counted.map((p) => p.episode.id)).size;
    b.latestPlacement = counted[0]?.episode.publishedAt ?? null;
    b.shows = [...new Set(counted.map((p) => p.episode.podcastName))];
    b.fit = fix(b.fit);
  }
  const cmp = (a: (typeof brands)[number], b: (typeof brands)[number]) => b.distinctShows - a.distinctShows || b.confirmed - a.confirmed || ms(b.latestPlacement) - ms(a.latestPlacement) || a.name.localeCompare(b.name);
  out.sponsors = brands.filter((b) => b.confirmed).sort(cmp);
  out.otherBrands = brands.filter((b) => !b.confirmed).sort((a, b) => b.distinctShows - a.distinctShows || b.affiliate + b.probable - (a.affiliate + a.probable) || cmp(a, b));
  out.sponsors.forEach((s, i) => (s.rank = i + 1));
  out.otherBrands.forEach((s, i) => (s.rank = out.sponsors.length + i + 1));
  out.opportunity.copy = fix(out.opportunity.copy);

  const inWin = (e: EpisodeRef, from: string) => ms(e.publishedAt) >= ms(from) && ms(e.publishedAt) <= ms(out.periodEnd);
  const dropped = episodesOf(old).filter((e) => remap.has(e.id));
  const droppedIds = [...new Map(dropped.map((e) => [e.id, e])).values()];
  out.stats.episodesIn30d -= droppedIds.filter((e) => inWin(e, out.window30Start)).length;
  out.stats.episodesIn7d -= droppedIds.filter((e) => inWin(e, out.periodStart)).length;

  const appear = (s: ReportSnapshot) => s.guests.reduce((n, g) => n + g.appearances, 0);
  console.log(`report ${period.key} v${row.version} (${row.status}); merged ${remap.size} duplicate episode id(s)`);
  console.log(`guests ${old.guests.length}→${out.guests.length} · appearances ${appear(old)}→${appear(out)} · topics ${old.topics.length}→${out.topics.length} · episodes30d ${old.stats.episodesIn30d}→${out.stats.episodesIn30d} · 7d ${old.stats.episodesIn7d}→${out.stats.episodesIn7d}`);
  for (const g of out.guests.filter((g) => g.history.length !== old.guests.find((o) => o.id === g.id)?.history.length)) console.log(`  guest ${g.name}: ${g.appearances} appearance(s)`);
  for (const t of out.topics) console.log(`  #${t.rank} topic ${t.name}: ${t.episodes} eps / prev ${t.previousEpisodes}`);
  for (const b of [...out.sponsors, ...out.otherBrands]) console.log(`  #${b.rank} ${b.name}: confirmed ${b.confirmed}, promoted ${b.affiliate + b.probable}`);
  if (!apply) return;
  must(await sb.from("weekly_reports").update({ snapshot: out }).eq("id", row.id).select("id").single(), "save report");
  console.log("saved");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
