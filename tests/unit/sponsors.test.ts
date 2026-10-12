import { describe, expect, it } from "vitest";
import { classifyPlacement, isHouseBrand, matchDisclosure, normalizeBrand, strongest } from "@/lib/sponsors";
import { classifySpoken } from "@/lib/server/pipeline/audio-step";

const confirmed = (excerpt: string, brand = "Acme") => classifyPlacement({ brand, excerpt, houseBrands: [] }).classification;

describe("sponsor rule classifier — written disclosures", () => {
  it.each([
    "This episode is sponsored by Acme.",
    "Brought to you by Acme, the payroll app.",
    "Presented by Acme",
    "Powered by Acme Cloud",
    "In association with Acme",
    "In partnership with Acme",
    "Try Acme today #ad",
    "Paid partnership with Acme",
    "Today's sponsor is Acme",
  ])("%s → confirmed", (text) => expect(confirmed(text)).toBe("confirmed"));

  it("disclosure without the brand name is not confirmed for that brand", () => {
    expect(confirmed("This episode is sponsored by Zeta.", "Acme")).toBe("organic");
  });

  it("promo code → affiliate", () => {
    expect(classifyPlacement({ brand: "Acme", excerpt: "Use code RADAR10 on Acme for 10% off", houseBrands: [] }).classification).toBe("affiliate");
    expect(classifyPlacement({ brand: "Acme", excerpt: "Get Acme at https://bit.ly/acme-deal", houseBrands: [] }).classification).toBe("affiliate");
  });

  it("promotional copy without disclosure → probable only when AI flagged it", () => {
    expect(classifyPlacement({ brand: "Acme", excerpt: "Acme helps founders close books in a day.", houseBrands: [], aiSuggested: "probable" }).classification).toBe("probable");
    expect(classifyPlacement({ brand: "Acme", excerpt: "Acme helps founders close books in a day.", houseBrands: [], aiSuggested: "organic" }).classification).toBe("organic");
  });

  it("AI cannot make something confirmed without the rule text", () => {
    expect(classifyPlacement({ brand: "Acme", excerpt: "Check out Acme", houseBrands: [], aiSuggested: "confirmed" }).classification).toBe("probable");
  });

  it("house brands are related-party and excluded", () => {
    expect(classifyPlacement({ brand: "Zerodha", excerpt: "Sponsored by Zerodha", houseBrands: ["Zerodha", "Gruhas"] }).classification).toBe("related_party");
    expect(isHouseBrand("Bombay Shaving Company Pvt Ltd", ["Bombay Shaving Company"])).toBe(true);
    expect(isHouseBrand("Neon", ["Neon Fund"])).toBe(true);
    expect(isHouseBrand("Accelerate Labs", ["Accel"])).toBe(false);
  });
});

describe("sponsor rule classifier — spoken (audio) disclosures", () => {
  it.each([
    ["this episode is brought to you by Acme", "confirmed"],
    ["is episode ko sponsor kiya hai Acme ne", "confirmed"],
    ["Acme is video ke sponsor hain", "confirmed"],
    ["humne Acme ke saath partnership ki hai", "confirmed"],
    ["यह एपिसोड Acme द्वारा प्रायोजित है", "confirmed"],
    ["use code FOUNDER on Acme", "affiliate"],
    ["Acme is a great app, check it out", "probable"],
  ])("%s → %s", (phrase, expected) => expect(classifySpoken("Acme", phrase, [])).toBe(expected));

  it("spoken house brand → related-party", () => {
    expect(classifySpoken("Zerodha", "brought to you by Zerodha", ["Zerodha"])).toBe("related_party");
  });
});

describe("helpers", () => {
  it("normalizes brand names", () => expect(normalizeBrand("Razorpay Software Pvt. Ltd.")).toBe("razorpay software"));
  it("keeps the strongest class per brand per episode", () => {
    expect(strongest("probable", "confirmed")).toBe("confirmed");
    expect(strongest("affiliate", "probable")).toBe("affiliate");
  });
  it("matches disclosure ids", () => expect(matchDisclosure("Sponsored BY x")).toBe("sponsored by"));
});

describe("affiliate codes seen in live data", () => {
  it("'get 50% off … with code RAJ2026' is affiliate, not probable", () => {
    expect(classifyPlacement({ brand: "Lifespan", excerpt: "Check out Lifespan and get 50% off all Lifespan memberships with code RAJ2026: https://lifespan.com/", houseBrands: [], aiSuggested: "probable" }).classification).toBe("affiliate");
  });
});
