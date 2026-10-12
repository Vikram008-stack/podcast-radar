import { pickOpportunity } from "@/lib/metrics";
import type { Opportunity, ReportSnapshot } from "@/lib/shared/types";

/**
 * What the Home page and archive feature (Aditya's rule, 12 Oct 2026): always fill the top 3 from
 * the ranked lists — no minimum show count — and always name an opportunity when any topic exists.
 * Applied at render time, so older snapshots follow the same rule.
 */
export function topPicks(s: ReportSnapshot) {
  const sponsors = [...s.sponsors, ...s.otherBrands].slice(0, 3); // confirmed first, then promotions
  let opportunity: Opportunity = s.opportunity;
  if (!opportunity.topic && s.topics.length) {
    const { topic, guest } = pickOpportunity(s.guests, s.topics);
    const sources: { label: string; url: string }[] = [];
    for (const e of topic?.referenceEpisodes.slice(0, 3) ?? []) if (e.url) sources.push({ label: `${e.podcastName}: ${e.title}`, url: e.url });
    opportunity = {
      topic: topic ? { id: topic.id, name: topic.name, distinctShows: topic.distinctShows, episodes: topic.episodes } : null,
      guest: guest ? { id: guest.id, name: guest.name, distinctShows: guest.distinctShows } : null,
      copy: [],
      sources,
    };
  }
  return { guests: s.guests.slice(0, 3), topics: s.topics.slice(0, 3), sponsors, opportunity };
}
