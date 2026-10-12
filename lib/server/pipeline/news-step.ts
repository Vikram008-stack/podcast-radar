import "server-only";
import { GeminiUnavailable } from "@/lib/server/ai/gemini";
import { NEWS_TAGGING_SYSTEM, NEWS_TAGGING_VERSION, newsTaggingParts, newsTaggingSchema } from "@/lib/server/ai/prompts/news-tagging";
import { db, must } from "@/lib/server/db";
import { fetchNews } from "@/lib/server/providers/news";
import type { Ctx } from "./context";
import type { Entities } from "./entities";

/** Fetch Inc42 / YourStory / Entrackr and tag new headlines to topics (one batched Gemini call). */
export async function runNews(ctx: Ctx, ents: Entities) {
  const sb = db();
  ctx.provider.news_fetches += 3;
  const { items, errors } = await fetchNews(ctx.period.prevStart);
  for (const e of errors) ctx.warn(`news: ${e}`);
  if (items.length) {
    await sb.from("news_articles").upsert(
      items.map((n) => ({ owner_id: ctx.owner, publisher: n.publisher, title: n.title, url: n.url, published_at: n.publishedAt, summary: n.summary })),
      { onConflict: "url", ignoreDuplicates: true },
    );
  }
  ctx.counters.newsArticles = items.length;
  if (!ctx.gemini) return;
  const untagged = must(
    await sb.from("news_articles").select("id,title").eq("owner_id", ctx.owner).eq("tagged", false).gte("published_at", ctx.period.prevStart.toISOString()).order("published_at", { ascending: false }).limit(80),
    "load untagged news",
  ) as { id: string; title: string }[];
  if (!untagged.length) return;
  try {
    const out = await ctx.gemini.json({
      name: "news-tagging",
      version: NEWS_TAGGING_VERSION,
      system: NEWS_TAGGING_SYSTEM,
      parts: newsTaggingParts(ents.taxonomy(), untagged),
      schema: newsTaggingSchema,
    });
    if (!out) return;
    const rows: { owner_id: string; news_id: string; topic_id: string }[] = [];
    for (const a of out.articles) {
      if (!untagged.some((u) => u.id === a.id)) continue;
      for (const s of a.slugs) {
        const t = ents.topicBySlugOrName(s);
        if (t) rows.push({ owner_id: ctx.owner, news_id: a.id, topic_id: t.id });
      }
    }
    if (rows.length) await sb.from("news_topics").upsert(rows, { onConflict: "news_id,topic_id", ignoreDuplicates: true });
    await sb.from("news_articles").update({ tagged: true }).in("id", untagged.map((u) => u.id));
    ctx.info(`news: tagged ${untagged.length} headlines → ${rows.length} topic links`);
  } catch (e) {
    if (e instanceof GeminiUnavailable) ctx.warn("news tagging skipped: Gemini quota");
    else ctx.warn(`news tagging failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}
