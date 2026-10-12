import { describe, expect, it } from "vitest";
import type { ReportSnapshot } from "@/lib/shared/types";
import { topPicks } from "@/lib/top-picks";

const item = (id: string, shows: number, extra: Record<string, unknown> = {}) => ({ id, name: id, distinctShows: shows, ...extra });

describe("top 3 always filled (Aditya's rule)", () => {
  const snap = {
    guests: ["g1", "g2", "g3", "g4"].map((g) => item(g, 1, { history: [] })),
    topics: [item("t1", 1, { slug: "t1", episodes: 2, referenceEpisodes: [] }), item("t2", 1, { slug: "t2", episodes: 1, referenceEpisodes: [] })],
    sponsors: [item("confirmed-brand", 1)],
    otherBrands: [item("recurring-promo", 1), item("one-off", 1), item("extra", 1)],
    opportunity: { topic: null, guest: null, copy: [], sources: [] },
  } as unknown as ReportSnapshot;
  const picks = topPicks(snap);

  it("fills guests and topics from the ranked lists with no minimum show count", () => {
    expect(picks.guests.map((g) => g.id)).toEqual(["g1", "g2", "g3"]);
    expect(picks.topics.map((t) => t.id)).toEqual(["t1", "t2"]); // only 2 exist → 1 honest empty slot
  });
  it("puts confirmed sponsors first, then promotions, to fill 3", () => {
    expect(picks.sponsors.map((s) => s.id)).toEqual(["confirmed-brand", "recurring-promo", "one-off"]);
  });
  it("always derives an opportunity from the top topic", () => {
    expect(picks.opportunity.topic?.id).toBe("t1");
  });
});
