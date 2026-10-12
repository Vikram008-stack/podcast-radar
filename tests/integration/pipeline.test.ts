/**
 * Integration tests: real Supabase (isolated throw-away owner) + mocked providers and Gemini.
 * Opt-in: RUN_INTEGRATION=1 npm test   (needs .env.local with Supabase URL + keys).
 * The test owner and all of its rows are deleted afterwards (FK cascade).
 */
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

config({ path: ".env.local" });
const RUN = process.env.RUN_INTEGRATION === "1" && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const TEST_EMAIL = `radar-test-${randomUUID().slice(0, 8)}@example.com`;
if (RUN) process.env.ALLOWED_EMAIL = TEST_EMAIL;
process.env.CRON_SECRET = "test-cron-secret-0123456789";

// Monday 05 Oct 2026 07:00 IST → reporting week 28 Sep – 04 Oct 2026
const NOW = new Date("2026-10-05T01:30:00Z");
const inWeek = (d: number) => new Date(Date.parse("2026-09-28T00:00:00+05:30") + d * 86_400_000 + 3_600_000).toISOString();

// ---------------------------------------------------------------- provider mocks
vi.mock("@/lib/server/providers/rss", () => ({
  parseDuration: () => null,
  fetchRss: vi.fn(async (url: string) => {
    if (url.includes("fail.test")) throw new Error("RSS feed responded 500");
    const show = url.includes("show-a") ? "A" : "B";
    return {
      notModified: false,
      title: `Show ${show}`,
      artwork: null,
      etag: undefined,
      lastModified: undefined,
      episodes: [
        {
          guid: `${show}-1`,
          title: `Scaling quick commerce ft. Test Guest | Show ${show}`,
          link: `https://example.com/${show}/1`,
          publishedAt: inWeek(show === "A" ? 1 : 2),
          description: "In this episode Test Guest joins us. This episode is brought to you by Acme Payroll, the payroll app for startups.",
          durationS: 3600,
          audioUrl: `https://example.com/${show}/1.mp3`,
          audioType: "audio/mpeg",
          artwork: null,
        },
      ],
    };
  }),
}));
vi.mock("@/lib/server/providers/news", () => ({ NEWS_FEEDS: [], fetchNews: vi.fn(async () => ({ items: [], errors: [] })) }));
vi.mock("@/lib/server/providers/spotify", async (orig) => {
  const real = await orig<typeof import("@/lib/server/providers/spotify")>();
  return { ...real, spotifyEpisodes: vi.fn(async () => { throw new real.SpotifyQuotaError("Spotify Scraper quota/rate limit (429)"); }) };
});
vi.mock("@/lib/server/providers/audio", () => ({
  ffmpegAvailable: vi.fn(async () => true),
  clipOpening: vi.fn(async () => { throw new Error("ffmpeg exited 1: simulated audio failure"); }),
}));
vi.mock("@/lib/server/ai/gemini", async (orig) => {
  const real = await orig<typeof import("@/lib/server/ai/gemini")>();
  class FakeGemini {
    calls = 0; tokensIn = 0; tokensOut = 0; logs: unknown[] = [];
    sdk = {};
    available() { return true; }
    remaining() { return 40; }
    async json({ name, parts }: { name: string; parts: { text?: string }[] }) {
      this.calls++;
      if (name === "episode-intel") {
        const ids = [...(parts[0].text ?? "").matchAll(/"episode_id":"([^"]+)"/g)].map((m) => m[1]);
        return {
          episodes: ids.map((id) => ({
            episode_id: id,
            in_scope: true,
            guests: [{ name: "Test Guest", role: "Founder", company: "Testco", guest_type: "startup_founder", india_startup_link: true, profile_urls: [], evidence_excerpt: "ft. Test Guest", source: "title", confidence: 0.9 }],
            topics: [{ slug: "quick-commerce", new_topic: null, confidence: 0.8 }],
            brands: [{ brand: "Acme Payroll", excerpt: "This episode is brought to you by Acme Payroll, the payroll app for startups.", suggested: "confirmed", confidence: 0.9 }],
          })),
        };
      }
      if (name === "brief") return { opportunity: [], guest_points: [], topic_swot: [], sponsor_fit: [] };
      return null;
    }
    static fromEnv() { return new FakeGemini(); }
  }
  return { ...real, Gemini: FakeGemini };
});

describe.skipIf(!RUN)("weekly pipeline (integration, mocked providers)", () => {
  let owner = "";
  let db: typeof import("@/lib/server/db").db;
  let runWeekly: typeof import("@/lib/server/pipeline/weekly").runWeekly;

  beforeAll(async () => {
    ({ db } = await import("@/lib/server/db"));
    ({ runWeekly } = await import("@/lib/server/pipeline/weekly"));
    owner = await (await import("@/lib/server/db")).ownerId();
    const base = { owner_id: owner, active: true, validation_status: "ok", analyse_audio: true, host_names: ["Host Person"], house_brands: [] };
    const { error } = await db().from("podcasts").insert([
      { ...base, name: "Show A", rss_url: "https://show-a.test/rss", spotify_show_id: "73VanEvg9Rhp2SOOJPFaav" },
      { ...base, name: "Show B", rss_url: "https://show-b.test/rss" },
      { ...base, name: "Broken Show", rss_url: "https://fail.test/rss" },
    ]);
    if (error) throw new Error(error.message);
    await db().from("topics").insert({ owner_id: owner, name: "Quick commerce", slug: "quick-commerce", category: "Sectors", is_seed: true });
  });

  afterAll(async () => {
    if (owner) await db().auth.admin.deleteUser(owner); // cascades every row of the test owner
  });

  let first: Awaited<ReturnType<typeof runWeekly>>;

  it("completes despite a failing feed, a Spotify 429 and an audio failure", async () => {
    first = await runWeekly({ trigger: "cli", audio: "analyse", now: NOW });
    expect(first.status).toBe("partial");
    expect(first.reportId).toBeTruthy();
    const { data: rep } = await db().from("weekly_reports").select("status,snapshot").eq("id", first.reportId!).single();
    expect(rep!.status).toBe("ready");
    const snap = rep!.snapshot as import("@/lib/shared/types").ReportSnapshot;
    // one feed failing → others succeed
    expect(snap.sources.find((s) => s.name === "Broken Show")?.status).toBe("failed");
    expect(snap.sources.find((s) => s.name === "Show A")?.status).toBe("ok");
    // text results are present even though audio failed
    expect(snap.guests[0]).toMatchObject({ name: "Test Guest", distinctShows: 2, appearances: 2 });
    expect(snap.sponsors[0]).toMatchObject({ name: "Acme Payroll", confirmed: 2, distinctShows: 2 });
    expect(snap.topics[0]).toMatchObject({ slug: "quick-commerce", distinctShows: 2 });
    expect(snap.opportunity.topic?.name).toBe("Quick commerce");
  });

  it("audio failure is recorded per episode, never failing the report", async () => {
    const { data } = await db().from("episodes").select("audio_status,audio_error").eq("owner_id", owner);
    expect(data!.length).toBe(2);
    expect(data!.every((e) => e.audio_status === "failed")).toBe(true);
  });

  it("Spotify quota error is tolerated and counted", async () => {
    const { data } = await db().from("ingestion_jobs").select("provider_calls,status").eq("owner_id", owner).eq("type", "weekly");
    expect(data![0].provider_calls.rapidapi_requests).toBeGreaterThanOrEqual(1);
  });

  it("is idempotent: running twice keeps one report per week", async () => {
    const second = await runWeekly({ trigger: "schedule", audio: "analyse", now: NOW });
    expect(second.status).toBe("skipped");
    const third = await runWeekly({ trigger: "cli", audio: "analyse", now: NOW }); // manual re-scan of a frozen week
    expect(third.reportId).toBe(first.reportId);
    const { count } = await db().from("weekly_reports").select("id", { count: "exact", head: true }).eq("owner_id", owner).eq("is_sample", false);
    expect(count).toBe(1);
    const { count: eps } = await db().from("episodes").select("id", { count: "exact", head: true }).eq("owner_id", owner);
    expect(eps).toBe(2); // no duplicate episodes
  });

  it("RLS: another signed-in user cannot read this owner's rows", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const otherEmail = `radar-other-${randomUUID().slice(0, 8)}@example.com`;
    const created = await db().auth.admin.createUser({ email: otherEmail, email_confirm: true });
    const otherId = created.data.user!.id;
    try {
      const link = await db().auth.admin.generateLink({ type: "magiclink", email: otherEmail });
      const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
      const { error } = await anon.auth.verifyOtp({ token_hash: link.data.properties!.hashed_token, type: "magiclink" });
      expect(error).toBeNull();
      const pods = await anon.from("podcasts").select("id").eq("owner_id", owner);
      expect(pods.data).toEqual([]);
      const reps = await anon.from("weekly_reports").select("id");
      expect(reps.data).toEqual([]);
      const ins = await anon.from("podcasts").insert({ owner_id: owner, name: "Hijack", rss_url: "https://x.test" });
      expect(ins.error).not.toBeNull();
      const anonNoSession = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
      expect((await anonNoSession.from("podcasts").select("id")).data).toEqual([]);
    } finally {
      await db().auth.admin.deleteUser(otherId);
    }
  });
});

describe("cron route auth", () => {
  it("rejects a missing or wrong CRON_SECRET", async () => {
    const { GET } = await import("@/app/api/cron/daily/route");
    const { NextRequest } = await import("next/server");
    const none = await GET(new NextRequest("http://localhost/api/cron/daily"));
    expect(none.status).toBe(401);
    expect(await none.json()).toEqual({ error: { code: "unauthorized", message: "Missing or wrong cron secret" } });
    const wrong = await GET(new NextRequest("http://localhost/api/cron/daily", { headers: { authorization: "Bearer nope" } }));
    expect(wrong.status).toBe(401);
  });
});
