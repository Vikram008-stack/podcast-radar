import { describe, expect, it } from "vitest";
import { guestInScope } from "@/lib/scope";

describe("content guardrail: Indian startups and their founders only", () => {
  it("keeps founders and investors of Indian startups", () => {
    expect(guestInScope({ guest_type: "startup_founder", india_startup_link: true })).toBe(true);
    expect(guestInScope({ guest_type: "startup_investor", india_startup_link: true })).toBe(false); // founders only
  });
  it("drops athletes, celebrities, academics and executives", () => {
    expect(guestInScope({ guest_type: "other", india_startup_link: false })).toBe(false); // e.g. a cricketer
    expect(guestInScope({ guest_type: "operator_or_expert", india_startup_link: true })).toBe(false); // professor, consultant
  });
  it("drops founders with no India startup link", () => {
    expect(guestInScope({ guest_type: "startup_founder", india_startup_link: false })).toBe(false);
  });
});

describe("outreach templates (no AI)", () => {
  it("builds a filled cold email + LinkedIn DM from the guest's evidence", async () => {
    const { guestTemplates, linkedinSearchUrl } = await import("@/lib/outreach-templates");
    const t = guestTemplates({
      id: "g", name: "Saurabh Mukherjea", role: "Founder", company: "Marcellus", aliases: [], reviewStatus: "ok", distinctShows: 1, appearances: 1,
      firstAppearance: "", latestAppearance: "", shows: ["Figuring Out"], talkingPoints: [], rank: 1,
      history: [{ episode: { id: "e", title: "Bulletproof Portfolio | Saurabh Mukherjea | FO573", podcastId: "p", podcastName: "Figuring Out", publishedAt: "", url: null, links: [], thumbnail: null, durationS: null }, evidence: { type: "title", excerpt: "", url: null }, roleAsStated: null, confidence: 1, topics: [] }],
    });
    expect(t.map((x) => x.key)).toEqual(["email", "dm"]);
    expect(t[0].body).toContain("Hi Saurabh");
    expect(t[0].body).toContain("Figuring Out");
    expect(t[0].body).toContain("Marcellus");
    expect(t[1].body.length).toBeLessThanOrEqual(300);
    expect(linkedinSearchUrl("Saurabh Mukherjea", "Marcellus")).toContain("keywords=Saurabh%20Mukherjea%20Marcellus");
  });
});
