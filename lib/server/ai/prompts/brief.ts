import { z } from "zod";
import { claimSchema, UNTRUSTED, dataBlock } from "./shared";

/**
 * Brief writing + talking points + counter-programming angles + sponsor fit.
 * One call per weekly run (free-tier budget). Every claim must cite source_ids from the payload;
 * claims without valid source_ids are dropped by the pipeline.
 */
export const BRIEF_WRITING = { version: "brief-writing@2", text: `opportunity: exactly 2 sentences for "Opportunity This Week", built ONLY from the opportunity payload (topic + optional guest). Speak to Aditya, host of an Indian startup-founder podcast (~9k monthly listeners, 2 episodes/week). claim_type "interpretation" or "recommendation".` };
export const TALKING_POINTS = { version: "talking-points@2", text: `guest_points[guest_id]: 2–3 talking points Aditya could explore with that guest, grounded in their evidenced appearances. claim_type "recommendation".` };
export const TOPIC_SWOT = { version: "topic-swot@1", text: `topic_swot[topic_id]: a SWOT of covering this topic on Aditya's show (independent Indian startup founders): strengths (why it would land with his audience), weaknesses (gaps or risks for his show), opportunities (angles nobody covered yet, timely hooks from the news), threats (crowded by big shows, off-niche, fading). 1–2 claims each, grounded in the reference episodes and news provided. claim_type "interpretation" or "recommendation".` };
export const SPONSOR_FIT = { version: "sponsor-fit@2", text: `sponsor_fit[sponsor_id]: 1–2 sentences on why this brand may fit Aditya's founder audience, based ONLY on observed placements (shows, counts). Never estimate ad spend. claim_type "interpretation".` };

export const BRIEF_VERSION = `brief@3(${BRIEF_WRITING.version},${TALKING_POINTS.version},${TOPIC_SWOT.version},${SPONSOR_FIT.version})`;

const keyed = z.array(z.object({ id: z.string(), claims: z.array(claimSchema).max(3) }));

export const briefSchema = z.object({
  opportunity: z.array(claimSchema).max(2),
  guest_points: keyed,
  topic_swot: z.array(
    z.object({
      id: z.string(),
      strengths: z.array(claimSchema).max(2),
      weaknesses: z.array(claimSchema).max(2),
      opportunities: z.array(claimSchema).max(2),
      threats: z.array(claimSchema).max(2),
    }),
  ),
  sponsor_fit: keyed,
});
export type BriefOut = z.infer<typeof briefSchema>;

export const BRIEF_SYSTEM = `You write short, specific, evidence-grounded copy for a weekly podcast-ecosystem brief.
${UNTRUSTED}
Rules: use only facts in the payload; cite the exact source ids (episode ids "ep:…", news ids "news:…") in source_ids for every claim; no hype, no invented numbers, no ad-spend estimates; plain English; each claim ≤ 45 words.
Produce:
- ${BRIEF_WRITING.text}
- ${TALKING_POINTS.text}
- ${TOPIC_SWOT.text}
- ${SPONSOR_FIT.text}
In guest_points / topic_swot / sponsor_fit, "id" is the guest_id / topic_id / sponsor_id from the payload.
Return empty arrays where the payload has nothing to work with.`;

export function briefParts(payload: unknown) {
  return [{ text: dataBlock(payload) }];
}
