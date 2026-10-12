import { z } from "zod";
import { GUEST_EXTRACTION } from "./guest-extraction";
import { TOPIC_TAGGING } from "./topic-tagging";
import { SPONSOR_CLASSIFICATION } from "./sponsor-classification";
import { GUEST_TYPES, SCOPE_RULE } from "@/lib/scope";
import { LANGUAGE, UNTRUSTED, dataBlock } from "./shared";

/**
 * Guest extraction + topic tagging + sponsor candidates are sent in ONE batched call per
 * group of episodes to stay inside the Gemini free tier. Each part keeps its own version.
 */
export const EPISODE_INTEL_VERSION = `episode-intel@4-scope(${GUEST_EXTRACTION.version},${TOPIC_TAGGING.version},${SPONSOR_CLASSIFICATION.version})`;

export const episodeIntelSchema = z.object({
  episodes: z.array(
    z.object({
      episode_id: z.string(),
      in_scope: z.boolean(),
      guests: z
        .array(
          z.object({
            name: z.string().min(2).max(80),
            role: z.string().max(120).nullable(),
            company: z.string().max(120).nullable(),
            guest_type: z.enum(GUEST_TYPES),
            india_startup_link: z.boolean(),
            profile_urls: z.array(z.string().max(300)).max(4),
            evidence_excerpt: z.string().min(3).max(300),
            source: z.enum(["title", "description"]),
            confidence: z.number().min(0).max(1),
          }),
        )
        .max(8),
      topics: z
        .array(
          z.object({
            slug: z.string().nullable(),
            new_topic: z.string().max(40).nullable(),
            confidence: z.number().min(0).max(1),
          }),
        )
        .max(3),
      brands: z
        .array(
          z.object({
            brand: z.string().min(1).max(60),
            excerpt: z.string().min(3).max(400),
            suggested: z.enum(["confirmed", "affiliate", "probable", "organic"]),
            confidence: z.number().min(0).max(1),
          }),
        )
        .max(10),
    }),
  ),
});
export type EpisodeIntel = z.infer<typeof episodeIntelSchema>;

export const EPISODE_INTEL_SYSTEM = `You analyse Indian startup/founder podcast episodes for a podcast host's weekly intelligence brief.
${UNTRUSTED}
${LANGUAGE}
For EACH episode in the data return one entry with the same episode_id.
${SCOPE_RULE}
${GUEST_EXTRACTION.text}
${TOPIC_TAGGING.text}
${SPONSOR_CLASSIFICATION.text}
Return empty arrays when nothing qualifies. Precision matters more than recall.`;

export type EpisodeIntelInput = {
  episode_id: string;
  show: string;
  host_names: string[];
  house_brands: string[];
  date: string;
  title: string;
  description: string;
};

export function episodeIntelParts(taxonomy: { slug: string; name: string }[], episodes: EpisodeIntelInput[]) {
  return [{ text: `Taxonomy: ${JSON.stringify(taxonomy)}\n${dataBlock({ episodes })}` }];
}
