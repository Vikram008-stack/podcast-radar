import "server-only";
import Parser from "rss-parser";
import { z } from "zod";
import { fetchRetry } from "@/lib/server/http";
import { stripHtml } from "@/lib/text";

export type RssEpisode = {
  guid: string;
  title: string;
  link: string | null;
  publishedAt: string;
  description: string;
  durationS: number | null;
  audioUrl: string | null;
  audioType: string | null;
  artwork: string | null;
};

export type RssResult =
  | { notModified: true; etag?: string; lastModified?: string }
  | {
      notModified: false;
      title: string;
      artwork: string | null;
      episodes: RssEpisode[];
      etag?: string;
      lastModified?: string;
    };

type Item = Parser.Item & {
  itunes?: { duration?: string; image?: string };
  "content:encoded"?: string;
  "itunes:image"?: { $?: { href?: string } };
};

const parser: Parser<Record<string, unknown>, Item> = new Parser({
  customFields: { item: ["content:encoded", "itunes:image"] },
});

const itemSchema = z.object({
  title: z.string().min(1),
  pubDate: z.string().min(1),
});

/** "1:02:03" | "3723" | "62:03" → seconds */
export function parseDuration(v: string | undefined | null): number | null {
  if (!v) return null;
  const s = String(v).trim();
  if (/^\d+$/.test(s)) return Number(s);
  const parts = s.split(":").map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return null;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

export async function fetchRss(
  url: string,
  cache: { etag?: string; lastModified?: string } = {},
): Promise<RssResult> {
  const headers: Record<string, string> = {
    "user-agent": "PodcastEcosystemRadar/1.0 (+single-user research tool)",
    accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
  };
  if (cache.etag) headers["if-none-match"] = cache.etag;
  if (cache.lastModified) headers["if-modified-since"] = cache.lastModified;
  const res = await fetchRetry(url, { headers, timeoutMs: 25_000, label: "rss" });
  const etag = res.headers.get("etag") ?? undefined;
  const lastModified = res.headers.get("last-modified") ?? undefined;
  if (res.status === 304) return { notModified: true, etag, lastModified };
  if (!res.ok) throw new Error(`RSS feed responded ${res.status}`);
  const xml = await res.text();
  const feed = await parser.parseString(xml);
  const episodes: RssEpisode[] = [];
  for (const it of feed.items) {
    const ok = itemSchema.safeParse(it);
    if (!ok.success) continue;
    const date = new Date(it.isoDate ?? it.pubDate ?? "");
    if (Number.isNaN(date.getTime())) continue;
    const raw = it["content:encoded"] || it.content || it.contentSnippet || "";
    const enc = it.enclosure;
    episodes.push({
      guid: String(it.guid || it.link || `${it.title}|${date.toISOString()}`),
      title: stripHtml(it.title).slice(0, 500),
      link: it.link ?? null,
      publishedAt: date.toISOString(),
      description: stripHtml(raw).slice(0, 20_000),
      durationS: parseDuration(it.itunes?.duration),
      audioUrl: enc?.url && /audio|mpeg|mp3|m4a|mp4a/i.test(`${enc.type ?? ""} ${enc.url}`) ? enc.url : null,
      audioType: enc?.type ?? null,
      artwork: it.itunes?.image ?? it["itunes:image"]?.$?.href ?? null,
    });
  }
  return {
    notModified: false,
    title: feed.title ?? "",
    artwork: (feed as { itunes?: { image?: string } }).itunes?.image ?? feed.image?.url ?? null,
    episodes,
    etag,
    lastModified,
  };
}
