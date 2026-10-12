import "server-only";
import { fetchRss } from "./rss";

/** Indian startup news feeds (verified 11 Oct 2026, see docs/DATA_SOURCES.md). */
export const NEWS_FEEDS = [
  { publisher: "Inc42", url: "https://inc42.com/feed/" },
  { publisher: "YourStory", url: "https://yourstory.com/feed" },
  { publisher: "Entrackr", url: "https://entrackr.com/rss" },
] as const;

export type NewsItem = { publisher: string; title: string; url: string; publishedAt: string; summary: string };

export async function fetchNews(since: Date): Promise<{ items: NewsItem[]; errors: string[] }> {
  const items: NewsItem[] = [];
  const errors: string[] = [];
  await Promise.all(
    NEWS_FEEDS.map(async (f) => {
      try {
        const r = await fetchRss(f.url);
        if (r.notModified) return;
        for (const e of r.episodes) {
          if (!e.link || new Date(e.publishedAt) < since) continue;
          items.push({ publisher: f.publisher, title: e.title, url: e.link, publishedAt: e.publishedAt, summary: e.description.slice(0, 400) });
        }
      } catch (err) {
        errors.push(`${f.publisher}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }),
  );
  return { items, errors };
}
