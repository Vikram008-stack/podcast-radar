import { afterEach, describe, expect, it } from "vitest";
import { integrationStatus, resetEnvCache, sampleMode } from "@/lib/env";
import { companiesConflict, isHost, namesSimilar, normalizePersonName, resolveGuest } from "@/lib/names";
import { audioOpeningSchema } from "@/lib/server/ai/prompts/audio-opening";
import { briefSchema } from "@/lib/server/ai/prompts/brief";
import { episodeIntelSchema } from "@/lib/server/ai/prompts/episode-intel";
import { keepSourced } from "@/lib/server/pipeline/report";
import { excerptInText, focusWindow, stripHtml } from "@/lib/text";

describe("guest name resolution", () => {
  it("normalises honorifics, ft./with patterns and punctuation", () => {
    expect(normalizePersonName("Dr. Sahar Sharma")).toBe("sahar sharma");
    expect(normalizePersonName("ft. Nithin Kamath (Zerodha)")).toBe("nithin kamath");
  });
  it("merges spelling variants", () => {
    expect(namesSimilar("Nithin Kamath", "Nitin Kamath")).toBe(true);
    expect(namesSimilar("Kunal Shah", "Kunal Bahl")).toBe(false);
  });
  const known = [{ id: "g1", name: "Nithin Kamath", company: "Zerodha", aliases: [] }];
  it("alias with compatible company resolves to the same guest", () => {
    expect(resolveGuest("Nitin Kamath", "Zerodha", known)).toEqual({ kind: "existing", id: "g1", aliasToAdd: "Nitin Kamath" });
    expect(resolveGuest("Nitin Kamath", null, known)).toMatchObject({ kind: "existing", id: "g1" });
  });
  it("never merges on name similarity when companies conflict — flags for review", () => {
    expect(resolveGuest("Nitin Kamath", "Acme Foods", known)).toMatchObject({ kind: "new", needsReview: true });
    expect(companiesConflict("Zerodha Broking", "Zerodha")).toBe(false);
  });
  it("hosts are never guests", () => {
    expect(isHost("Raj Shamani", ["Raj Shamani"])).toBe(true);
    expect(isHost("Nansi", ["Siddhartha Ahluwalia", "Nansi"])).toBe(true);
    expect(isHost("Aadit Palicha", ["Raj Shamani"])).toBe(false);
  });
});

describe("Zod validation of Gemini outputs", () => {
  it("accepts a well-formed episode-intel payload", () => {
    const ok = episodeIntelSchema.safeParse({
      episodes: [{ episode_id: "e1", in_scope: true, guests: [{ name: "Aadit Palicha", role: "CEO", company: "Zepto", guest_type: "startup_founder", india_startup_link: true, profile_urls: [], evidence_excerpt: "ft. Aadit Palicha", source: "title", confidence: 0.9 }], topics: [{ slug: "quick-commerce", new_topic: null, confidence: 0.8 }], brands: [] }],
    });
    expect(ok.success).toBe(true);
  });
  it("rejects out-of-range confidence and unknown enums", () => {
    expect(episodeIntelSchema.safeParse({ episodes: [{ episode_id: "e", in_scope: true, guests: [], topics: [{ slug: "x", new_topic: null, confidence: 2 }], brands: [] }] }).success).toBe(false);
    expect(episodeIntelSchema.safeParse({ episodes: [{ episode_id: "e", guests: [], topics: [], brands: [] }] }).success).toBe(false); // in_scope is required
    expect(episodeIntelSchema.safeParse({ episodes: [{ episode_id: "e", guests: [], topics: [], brands: [{ brand: "A", excerpt: "abc", suggested: "maybe", confidence: 0.5 }] }] }).success).toBe(false);
  });
  it("validates audio-opening JSON (timestamps, kinds)", () => {
    expect(audioOpeningSchema.safeParse({ sponsor_reads: [{ brand: "Acme", disclosure_phrase: "brought to you by Acme", timestamp_s: 134, kind: "confirmed" }], guest_introductions: [], topics: ["AI"] }).success).toBe(true);
    expect(audioOpeningSchema.safeParse({ sponsor_reads: [{ brand: "Acme", disclosure_phrase: "x y z", timestamp_s: -1, kind: "confirmed" }], guest_introductions: [], topics: [] }).success).toBe(false);
    expect(audioOpeningSchema.safeParse({ sponsor_reads: [], guest_introductions: [{ name: "A B", role_company: null, quote: "welcome", timestamp_s: 1.5 }], topics: [] }).success).toBe(false);
  });
  it("brief claims need claim_type from the allowed set", () => {
    expect(briefSchema.safeParse({ opportunity: [{ claim: "Do X", claim_type: "guess", source_ids: [], confidence: 0.5 }], guest_points: [], topic_swot: [], sponsor_fit: [] }).success).toBe(false);
  });
  it("drops claims with no valid source ids", () => {
    const valid = new Set(["ep:1"]);
    const out = keepSourced(
      [
        { claim: "grounded", claim_type: "interpretation", source_ids: ["ep:1", "ep:999"], confidence: 0.7 },
        { claim: "hallucinated", claim_type: "recommendation", source_ids: ["ep:404"], confidence: 0.9 },
        { claim: "unsourced", claim_type: "observed", source_ids: [], confidence: 0.9 },
      ],
      valid,
    );
    expect(out).toEqual([{ claim: "grounded", claim_type: "interpretation", source_ids: ["ep:1"], confidence: 0.7 }]);
  });
});

describe("evidence text helpers", () => {
  it("verifies AI-quoted excerpts exist in the source (punctuation/case-insensitive)", () => {
    expect(excerptInText("Brought to you by ACME!", "This show is brought to you by Acme, the app.")).toBe(true);
    expect(excerptInText("sponsored by Zeta", "This show is brought to you by Acme")).toBe(false);
  });
  it("keeps the disclosure phrase inside the ≤25-word stored window", () => {
    const long = Array.from({ length: 40 }, (_, i) => `w${i}`).join(" ") + " this episode is sponsored by Acme payroll for startups";
    const w = focusWindow(long, /sponsored\s+by/i, 25);
    expect(w).toContain("sponsored by Acme");
    expect(w.replace(/…/g, "").trim().split(/\s+/).length).toBeLessThanOrEqual(25);
  });
  it("strips HTML safely", () => expect(stripHtml("<p>Hi&nbsp;<b>there</b><script>alert(1)</script></p>")).toBe("Hi there"));
});

describe("missing-key behaviour", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    resetEnvCache();
  });
  it("reports unconfigured integrations without exposing values", () => {
    delete process.env.YOUTUBE_API_KEY;
    delete process.env.RAPIDAPI_KEY;
    process.env.GEMINI_API_KEY = "secret-value";
    resetEnvCache();
    const s = integrationStatus();
    expect(s.find((x) => x.key === "youtube")?.configured).toBe(false);
    expect(s.find((x) => x.key === "gemini")?.configured).toBe(true);
    expect(JSON.stringify(s)).not.toContain("secret-value");
  });
  it("sample mode is impossible in production", () => {
    process.env.SAMPLE_DATA_MODE = "true";
    process.env.VERCEL_ENV = "production";
    resetEnvCache();
    expect(sampleMode()).toBe(false);
    process.env.VERCEL_ENV = "development";
    resetEnvCache();
    expect(sampleMode()).toBe(true);
  });
});
