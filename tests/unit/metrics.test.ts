import { describe, expect, it } from "vitest";
import { featured, featuredGuests, pickOpportunity, rankGuests, rankSponsors, rankTopics, topicChange, type Facts } from "@/lib/metrics";
import { periodFromStart } from "@/lib/time";

const p = periodFromStart(new Date("2026-10-04T18:30:00Z")); // Mon 05 Oct 2026 00:00 IST
const day = (n: number) => new Date(p.start.getTime() + n * 86_400_000 + 3_600_000).toISOString(); // n days after week start
const ep = (id: string, show: string, d: string) => ({ id, title: id, podcastId: show, podcastName: show.toUpperCase(), publishedAt: d, url: `https://x/${id}`, links: [], thumbnail: null, durationS: 3600, stats: null });
const ev = { type: "show_notes" as const, excerpt: "ft. someone", url: "https://x" };
const guest = (n: string) => ({ id: n, name: n, role: null, company: null, aliases: [], reviewStatus: "ok" as const });

function facts(partial: Partial<Facts>): Facts {
  return { episodes: [], guests: [], appearances: [], topics: [], episodeTopics: [], brands: [], placements: [], news: [], ...partial };
}

describe("guest ranking (30 days)", () => {
  const f = facts({
    episodes: [ep("e1", "a", day(1)), ep("e2", "b", day(2)), ep("e3", "a", day(-3)), ep("e4", "c", day(-10)), ep("e5", "a", day(-40))],
    guests: ["Asha", "Bina", "Chetan", "Dev"].map(guest),
    appearances: [
      { guestId: "Bina", episodeId: "e1", evidence: ev, roleAsStated: null, confidence: 0.9 },
      { guestId: "Bina", episodeId: "e2", evidence: ev, roleAsStated: null, confidence: 0.9 },
      { guestId: "Asha", episodeId: "e3", evidence: ev, roleAsStated: null, confidence: 0.9 },
      { guestId: "Asha", episodeId: "e4", evidence: ev, roleAsStated: null, confidence: 0.9 },
      { guestId: "Chetan", episodeId: "e1", evidence: ev, roleAsStated: null, confidence: 0.9 },
      { guestId: "Dev", episodeId: "e5", evidence: ev, roleAsStated: null, confidence: 0.9 }, // outside 30d
    ],
  });
  const ranked = rankGuests(f, p);

  it("ranks distinct shows → appearances → latest → name", () => {
    expect(ranked.map((g) => g.name)).toEqual(["Bina", "Asha", "Chetan"]);
    expect(ranked[0]).toMatchObject({ distinctShows: 2, appearances: 2, rank: 1 });
  });
  it("excludes appearances outside the 30-day window", () => expect(ranked.find((g) => g.name === "Dev")).toBeUndefined());
  it("featured guests need ≥ 1 show, top 3 in rank order, never padded", () => expect(featuredGuests(ranked).map((g) => g.name)).toEqual(["Bina", "Asha", "Chetan"]));
  it("topics keep the ≥ 2 shows rule", () => expect(featured(ranked).map((g) => g.name)).toEqual(["Bina", "Asha"]));
  it("full ties break by name", () => {
    const t = rankGuests(
      facts({
        episodes: [ep("x", "a", day(1))],
        guests: ["Zoe", "Amit"].map(guest),
        appearances: ["Zoe", "Amit"].map((g) => ({ guestId: g, episodeId: "x", evidence: ev, roleAsStated: null, confidence: 1 })),
      }),
      p,
    );
    expect(t.map((g) => g.name)).toEqual(["Amit", "Zoe"]);
  });
});

describe("topic ranking (7 days) and change", () => {
  it("change = (current − previous) / previous, New when previous = 0", () => {
    expect(topicChange(3, 2)).toBe(0.5);
    expect(topicChange(1, 2)).toBe(-0.5);
    expect(topicChange(2, 0)).toBeNull();
  });
  const f = facts({
    episodes: [ep("1", "a", day(0)), ep("2", "b", day(1)), ep("3", "a", day(2)), ep("4", "b", day(3)), ep("5", "a", day(-2)), ep("6", "c", day(4))],
    topics: [
      { id: "t1", slug: "ai", name: "AI startups", category: null },
      { id: "t2", slug: "d2c", name: "D2C brands", category: null },
      { id: "t3", slug: "vc", name: "Fundraising", category: null },
    ],
    episodeTopics: [
      { episodeId: "1", topicId: "t1" },
      { episodeId: "2", topicId: "t1" },
      { episodeId: "5", topicId: "t1" },
      { episodeId: "3", topicId: "t2" },
      { episodeId: "4", topicId: "t2" },
      { episodeId: "6", topicId: "t3" },
    ],
  });
  const r = rankTopics(f, p);
  it("ranks distinct shows → episodes → change, with New above any finite change", () => {
    expect(r.map((t) => t.slug)).toEqual(["d2c", "ai", "vc"]);
    expect(r.find((t) => t.slug === "ai")!.change).toBe(1);
    expect(r.find((t) => t.slug === "d2c")!.change).toBeNull();
    expect(r.find((t) => t.slug === "ai")!.previousEpisodes).toBe(1);
  });
});

describe("sponsor ranking (30 days)", () => {
  const f = facts({
    episodes: [ep("1", "a", day(0)), ep("2", "b", day(1)), ep("3", "a", day(2)), ep("4", "c", day(3))],
    brands: [
      { id: "b1", name: "Acme" },
      { id: "b2", name: "Beta" },
      { id: "b3", name: "House" },
      { id: "b4", name: "Gamma" },
    ],
    placements: [
      { brandId: "b1", episodeId: "1", classification: "confirmed", confidence: 1, evidence: [], detectedAt: day(0) },
      { brandId: "b1", episodeId: "3", classification: "confirmed", confidence: 1, evidence: [], detectedAt: day(2) },
      { brandId: "b2", episodeId: "1", classification: "confirmed", confidence: 1, evidence: [], detectedAt: day(0) },
      { brandId: "b2", episodeId: "2", classification: "confirmed", confidence: 1, evidence: [], detectedAt: day(1) },
      { brandId: "b3", episodeId: "4", classification: "related_party", confidence: 1, evidence: [], detectedAt: day(3) },
      { brandId: "b4", episodeId: "4", classification: "probable", confidence: 1, evidence: [], detectedAt: day(3) },
    ],
  });
  const { sponsors, others } = rankSponsors(f, p);
  it("ranks confirmed by distinct shows → confirmed placements → latest", () => {
    expect(sponsors.map((s) => s.name)).toEqual(["Beta", "Acme"]);
    expect(sponsors[1]).toMatchObject({ confirmed: 2, distinctShows: 1, distinctEpisodes: 2 });
  });
  it("probable/affiliate counted separately; related-party excluded", () => {
    expect(others.map((s) => s.name)).toEqual(["Gamma"]);
    expect([...sponsors, ...others].find((s) => s.name === "House")).toBeUndefined();
  });
});

describe("opportunity this week", () => {
  it("picks the top featured topic + top featured guest evidenced on that topic", () => {
    const f = facts({
      episodes: [ep("1", "a", day(0)), ep("2", "b", day(1))],
      topics: [{ id: "t1", slug: "ai", name: "AI", category: null }],
      episodeTopics: [
        { episodeId: "1", topicId: "t1" },
        { episodeId: "2", topicId: "t1" },
      ],
      guests: [guest("g")],
      appearances: [
        { guestId: "g", episodeId: "1", evidence: ev, roleAsStated: null, confidence: 1 },
        { guestId: "g", episodeId: "2", evidence: ev, roleAsStated: null, confidence: 1 },
      ],
    });
    const o = pickOpportunity(rankGuests(f, p), rankTopics(f, p));
    expect(o.topic?.slug).toBe("ai");
    expect(o.guest?.id).toBe("g");
  });
  it("uses the top-ranked topic even when it is on a single show (no empty banner)", () => {
    const f = facts({ episodes: [ep("1", "a", day(0))], topics: [{ id: "t", slug: "s", name: "S", category: null }], episodeTopics: [{ episodeId: "1", topicId: "t" }] });
    expect(pickOpportunity([], rankTopics(f, p)).topic?.id).toBe("t");
    expect(pickOpportunity([], []).topic).toBeNull();
  });
});
