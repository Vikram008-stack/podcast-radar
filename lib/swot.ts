import type { TopicSignal } from "@/lib/shared/types";

export type SimpleSwot = { strengths: string[]; weaknesses: string[]; opportunities: string[]; threats: string[] };

/** Big general-interest channels: covering the same topic there is crowded for a small show. */
const BIG_SHOWS = /raj shamani|figuring out|people by wtf|nikhil kamath/i;

/**
 * SWOT from the observed counts only (no AI) — always available, so the panel is never empty.
 * Perspective: should Aditya's show (independent Indian startup founders, ~9k listeners) cover it?
 */
export function observedSwot(t: TopicSignal): SimpleSwot {
  const s: SimpleSwot = { strengths: [], weaknesses: [], opportunities: [], threats: [] };
  const shows = t.shows.join(", ");

  if (t.distinctShows >= 2) s.strengths.push(`Proven interest: ${t.distinctShows} different shows covered it this week (${t.episodes} episodes).`);
  else s.strengths.push(`Only one show (${shows}) covered it — little direct competition for your take.`);
  if (t.audienceResponse.some((a) => (a.views ?? 0) > 100_000)) s.strengths.push("Strong public response: at least one episode passed 100K YouTube views.");

  if (t.distinctShows >= 2) s.weaknesses.push(`Already covered by ${shows} — you need a sharper, founder-first angle to stand out.`);
  if (!t.news.length) s.weaknesses.push("No Indian startup news on it in the last two weeks — fewer fresh hooks.");
  if (!s.weaknesses.length) s.weaknesses.push("Single-episode signal so far — the trend may not hold.");

  if (t.change === null) s.opportunities.push("New this week (nothing last week) — early-mover chance before it gets crowded.");
  else if (t.change > 0) s.opportunities.push(`Growing: ${Math.round(t.change * 100)}% more episodes than last week.`);
  if (t.news.length) s.opportunities.push(`${t.news.length} recent ${t.news.length === 1 ? "headline" : "headlines"} (${t.news[0].publisher}) to hook an episode on.`);
  if (!s.opportunities.length) s.opportunities.push("Counter-programme it: the founder-builder angle the bigger shows skip.");

  if (t.shows.some((x) => BIG_SHOWS.test(x))) s.threats.push("A very large channel covered it — your episode competes with their reach.");
  if (t.change !== null && t.change < 0) s.threats.push(`Cooling: ${Math.abs(Math.round(t.change * 100))}% fewer episodes than last week.`);
  if (t.category === "Emerging") s.threats.push("Outside the core startup taxonomy — check it fits your founder audience.");
  if (!s.threats.length) s.threats.push("Others can copy quickly — publish while it is fresh.");
  return s;
}
