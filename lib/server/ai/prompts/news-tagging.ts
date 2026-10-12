import { z } from "zod";
import { TOPIC_TAGGING } from "./topic-tagging";
import { UNTRUSTED, dataBlock } from "./shared";

export const NEWS_TAGGING_VERSION = `news-tagging@1(${TOPIC_TAGGING.version})`;

export const newsTaggingSchema = z.object({
  articles: z.array(z.object({ id: z.string(), slugs: z.array(z.string()).max(2) })),
});

export const NEWS_TAGGING_SYSTEM = `Tag Indian startup news headlines with 0–2 topic slugs from the taxonomy. Use only slugs from the list; return an empty list when none clearly fits.
${UNTRUSTED}`;

export function newsTaggingParts(taxonomy: { slug: string; name: string }[], articles: { id: string; title: string }[]) {
  return [{ text: `Taxonomy: ${JSON.stringify(taxonomy)}\n${dataBlock({ articles })}` }];
}
