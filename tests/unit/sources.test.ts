import { describe, expect, it } from "vitest";
import { findMatch, sameEpisode } from "@/lib/dedupe";
import { parseAppleResults } from "@/lib/server/providers/apple";
import { parseDuration } from "@/lib/server/providers/rss";
import { parseSpotifyEpisodes, parseSpotifyShowId } from "@/lib/server/providers/spotify";
import { isFullEpisode, isoDurationToSeconds, parseChannelRef } from "@/lib/server/providers/youtube";
import { mergeDescriptions } from "@/lib/server/pipeline/ingest";

describe("YouTube clip filter", () => {
  it("parses ISO-8601 durations", () => {
    expect(isoDurationToSeconds("PT1H2M3S")).toBe(3723);
    expect(isoDurationToSeconds("PT59S")).toBe(59);
    expect(isoDurationToSeconds("P0D")).toBe(0);
  });
  it("counts only videos ≥ MIN_EPISODE_MINUTES as episodes", () => {
    expect(isFullEpisode(58, 20)).toBe(false); // Short
    expect(isFullEpisode(19 * 60 + 59, 20)).toBe(false); // clip
    expect(isFullEpisode(20 * 60, 20)).toBe(true);
  });
  it("reads channel references", () => {
    expect(parseChannelRef("https://www.youtube.com/@rajshamani")).toEqual({ handle: "rajshamani" });
    expect(parseChannelRef("https://youtube.com/channel/UCzwCEE_PchiBULMnAJqhGVg")).toEqual({ id: "UCzwCEE_PchiBULMnAJqhGVg" });
    expect(parseChannelRef("nikhil.kamath")).toEqual({ handle: "nikhil.kamath" });
  });
});

describe("RSS ↔ YouTube ↔ Spotify dedupe", () => {
  const rss = { title: "Ep 212: How Zepto Built 10-Minute Delivery | Aadit Palicha", publishedAt: "2026-10-01T05:00:00Z" };
  it("merges close titles within 3 days", () => {
    expect(sameEpisode(rss, { title: "How Zepto Built 10-Minute Delivery | Aadit Palicha (Full Episode)", publishedAt: "2026-10-02T12:00:00Z" })).toBe(true);
  });
  it("does not merge when dates are more than 3 days apart", () => {
    expect(sameEpisode(rss, { title: rss.title, publishedAt: "2026-10-05T06:00:00Z" })).toBe(false);
  });
  it("does not merge different parts of the same series", () => {
    expect(
      sameEpisode(
        { title: "Part 1: Mukesh Bansal on founder mode in the AI age", publishedAt: "2026-08-10T00:00:00Z" },
        { title: "Part 2: Mukesh Bansal on hiring for loyalty to a mission", publishedAt: "2026-08-11T00:00:00Z" },
      ),
    ).toBe(false);
  });
  it("findMatch returns the matching candidate", () => {
    const hit = findMatch(rss, [
      { title: "Something else entirely", publishedAt: rss.publishedAt },
      { title: "How Zepto built 10 minute delivery — Aadit Palicha", publishedAt: rss.publishedAt },
    ]);
    expect(hit?.title).toContain("Zepto");
  });
  it("merged description keeps one block per provider and drops duplicates", () => {
    const d = mergeDescriptions([
      { provider: "rss", description: "Same notes" },
      { provider: "spotify", description: "Same notes" },
      { provider: "youtube", description: "Chapters 00:00 intro" },
    ]);
    expect(d.match(/Same notes/g)?.length).toBe(1);
    expect(d).toContain("[YouTube description]");
  });
  it("parses RSS durations", () => {
    expect(parseDuration("1:02:03")).toBe(3723);
    expect(parseDuration("3600")).toBe(3600);
    expect(parseDuration("bad")).toBeNull();
  });
});

describe("Apple Podcasts lookup parsing", () => {
  it("extracts feedUrl + artwork and skips malformed rows", () => {
    const r = parseAppleResults({
      resultCount: 2,
      results: [
        { collectionId: 1509981658, collectionName: "Founder Thesis", artistName: "ThePodium.in", feedUrl: "https://feeds.zencastr.com/f/mbqvPYFP.rss", artworkUrl600: "https://img.example/600.jpg" },
        { wrapperType: "track" },
      ],
    });
    expect(r).toEqual([
      { collectionId: "1509981658", name: "Founder Thesis", artist: "ThePodium.in", feedUrl: "https://feeds.zencastr.com/f/mbqvPYFP.rss", artwork: "https://img.example/600.jpg", lastRelease: null, episodeCount: null },
    ]);
  });
  it("rejects a non-Apple payload", () => expect(() => parseAppleResults({ nope: true })).toThrow());
});

describe("Spotify Scraper parsing (verified response shape)", () => {
  it("reads episodes.items with date, description and durationMs", () => {
    const eps = parseSpotifyEpisodes({
      status: true,
      episodes: { totalCount: 1, items: [{ type: "episode", id: "7lXij9LZ6GpW0LM729kMzk", name: "How AWS…", date: "2026-10-09T11:30:00Z", description: "On this episode…", durationMs: 3_600_000 }] },
    });
    expect(eps[0]).toMatchObject({ id: "7lXij9LZ6GpW0LM729kMzk", durationS: 3600, url: "https://open.spotify.com/episode/7lXij9LZ6GpW0LM729kMzk" });
  });
  it("returns [] for an error payload", () => expect(parseSpotifyEpisodes({ status: false, errorId: "InvalidParam" })).toEqual([]));
  it("parses show urls", () => expect(parseSpotifyShowId("https://open.spotify.com/show/73VanEvg9Rhp2SOOJPFaav?si=x")).toBe("73VanEvg9Rhp2SOOJPFaav"));
});

describe("promo-aware description excerpt", () => {
  it("keeps sponsor lines that sit far down a long description", async () => {
    const { promoAwareExcerpt } = await import("@/lib/text");
    const filler = Array.from({ length: 120 }, (_, i) => `00:${String(i).padStart(2, "0")} Chapter ${i} about founders`).join("\n");
    const text = `Guest: Asha Rao, founder of Example.\n${filler}\nThis episode is brought to you by Acme Payroll.\nUse code RADAR10 at https://acme.example`;
    const out = promoAwareExcerpt(text, 1500);
    expect(out.length).toBeLessThanOrEqual(1500);
    expect(out).toContain("Guest: Asha Rao");
    expect(out).toContain("brought to you by Acme Payroll");
    expect(out).toContain("Use code RADAR10");
  });
});
