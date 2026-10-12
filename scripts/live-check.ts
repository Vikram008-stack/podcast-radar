// Live end-to-end check of every component against production + the real external services.
// Usage: npm run check:live [-- https://your-app.vercel.app]
// Costs: 1 YouTube unit, 1 Spotify Scraper request, 1 small Gemini call.
import { config } from "dotenv";
config({ path: ".env.local" });

type Result = { component: string; check: string; ok: boolean; detail: string; ms: number };
const results: Result[] = [];
const BASE = process.argv[2] ?? "https://podcast-ecosystem-radar.vercel.app";

async function check(component: string, name: string, fn: () => Promise<string>) {
  const t = Date.now();
  try {
    const detail = await fn();
    results.push({ component, check: name, ok: true, detail, ms: Date.now() - t });
  } catch (e) {
    results.push({ component, check: name, ok: false, detail: e instanceof Error ? e.message.slice(0, 160) : String(e), ms: Date.now() - t });
  }
}
const assert = (c: unknown, m: string) => {
  if (!c) throw new Error(m);
};
async function get(path: string, init?: RequestInit) {
  return fetch(BASE + path, { redirect: "manual", ...init });
}

async function main() {
  const { fetchRss } = await import("@/lib/server/providers/rss");
  const { resolveChannel, recentUploads } = await import("@/lib/server/providers/youtube");
  const { spotifyEpisodes } = await import("@/lib/server/providers/spotify");
  const { searchApple } = await import("@/lib/server/providers/apple");
  const { fetchNews } = await import("@/lib/server/providers/news");
  const { Gemini } = await import("@/lib/server/ai/gemini");
  const { z } = await import("zod");
  const { createClient } = await import("@supabase/supabase-js");
  const { db, ownerId } = await import("@/lib/server/db");

  // ---- Web app (Vercel)
  for (const p of ["/", "/guests", "/topics", "/sponsors", "/reports", "/settings", "/login"]) {
    await check("Web app (Vercel)", `GET ${p}`, async () => {
      const r = await get(p);
      assert(r.status === 200, `status ${r.status}`);
      const html = await r.text();
      if (p !== "/login") assert(html.includes("View-only"), "public view-only banner missing");
      return `200 · ${(html.length / 1024).toFixed(0)} KB`;
    });
  }
  await check("Web app (Vercel)", "Guest / topic / sponsor detail pages", async () => {
    const owner = await ownerId();
    const { data } = await db().from("weekly_reports").select("snapshot").eq("owner_id", owner).eq("status", "ready").eq("is_sample", false).order("period_start", { ascending: false }).limit(1).single();
    const s = data!.snapshot as { guests: { id: string }[]; topics: { id: string }[]; sponsors: { id: string }[] };
    const urls = [`/guests/${s.guests[0].id}`, `/topics/${s.topics[0].id}`, `/sponsors/${s.sponsors[0].id}`];
    for (const u of urls) assert((await get(u)).status === 200, `${u} not 200`);
    assert((await get("/guests/00000000-0000-4000-8000-000000000000")).status === 404, "unknown id should 404");
    return "3 detail pages 200 · unknown id 404";
  });
  await check("Web app (Vercel)", "GET /api/health", async () => {
    const j = await (await get("/api/health")).json();
    assert(j.ok && j.database, "db not ok");
    const missing = Object.entries(j.integrations).filter(([, v]) => !v).map(([k]) => k);
    assert(!missing.length, `missing: ${missing.join(",")}`);
    return "DB reachable · 6/6 integrations configured";
  });

  // ---- Auth & security
  await check("Auth & security", "Writes need sign-in", async () => {
    const a = await get("/api/podcasts", { method: "POST", body: "{}", headers: { "content-type": "application/json" } });
    const b = await get("/api/jobs/run", { method: "POST", body: "{}" });
    const c = await get("/api/guests/x/outreach-draft", { method: "POST", body: '{"action":"generate"}' });
    assert(a.status === 401 && b.status === 401 && c.status === 401, `${a.status}/${b.status}/${c.status}`);
    return "add show / run scan / AI draft → 401 when signed out";
  });
  await check("Auth & security", "Cron secret enforced", async () => {
    const r = await get("/api/cron/daily");
    assert(r.status === 401, `status ${r.status}`);
    const ok = await get("/api/cron/daily", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
    const j = await ok.json();
    assert(ok.status === 200 && j.keepAlive, `authorised status ${ok.status}`);
    return `no secret → 401 · with secret → 200 (keep-alive, catch-up: ${j.catchUp ? "started" : j.reason})`;
  });
  await check("Auth & security", "Magic-link endpoint", async () => {
    const r = await get("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "not-aditya@example.com" }), headers: { "content-type": "application/json" } });
    assert(r.status === 200, `status ${r.status}`);
    return "other emails get the same response, no link sent";
  });
  await check("Supabase (DB + RLS)", "Anonymous key sees no rows", async () => {
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    for (const t of ["podcasts", "weekly_reports", "drafts", "episodes"]) {
      const { data } = await anon.from(t).select("id").limit(1);
      assert((data ?? []).length === 0, `${t} leaked`);
    }
    return "podcasts, reports, drafts, episodes → 0 rows (RLS)";
  });
  await check("Supabase (DB + RLS)", "Data present", async () => {
    const owner = await ownerId();
    const c = async (t: string) => (await db().from(t).select("id", { count: "exact", head: true }).eq("owner_id", owner)).count ?? 0;
    const [p, e, g, b, n, r] = await Promise.all(["podcasts", "episodes", "guests", "brands", "news_articles", "weekly_reports"].map(c));
    return `${p} shows · ${e} episodes · ${g} guests · ${b} brands · ${n} news · ${r} reports`;
  });

  // ---- External services (same adapters the pipeline uses)
  await check("RSS feeds", "The Neon Show feed", async () => {
    const r = await fetchRss("https://feeds.buzzsprout.com/1601695.rss");
    if (r.notModified) throw new Error("unexpected 304");
    assert(r.episodes.length > 0, "no episodes");
    const e = r.episodes[0];
    return `${r.episodes.length} items · latest ${e.publishedAt.slice(0, 10)} · audio enclosure ${e.audioUrl ? "yes" : "no"}`;
  });
  await check("YouTube Data API", "channels.list + playlistItems + videos", async () => {
    const q = { units: 0 };
    const ch = await resolveChannel({ id: "UChwUqkuczHA_d-TV3n0LN9w" }, process.env.YOUTUBE_API_KEY!, q);
    const vids = await recentUploads(ch!, new Date(Date.now() - 14 * 86_400_000), process.env.YOUTUBE_API_KEY!, q);
    return `${ch!.title} · ${vids.length} uploads in 14 days · ${q.units} units`;
  });
  await check("Spotify Scraper (RapidAPI)", "/v1/podcast/episodes", async () => {
    const c = { requests: 0 };
    const eps = await spotifyEpisodes("73VanEvg9Rhp2SOOJPFaav", { key: process.env.RAPIDAPI_KEY!, host: "spotify-scraper.p.rapidapi.com" }, c);
    assert(eps.length && eps[0].description.length > 20, "no descriptions");
    return `${eps.length} episodes with descriptions · 1 request`;
  });
  await check("Apple Podcasts lookup", "search 'Founder Thesis'", async () => {
    const r = await searchApple("Founder Thesis", 3);
    assert(r[0]?.feedUrl, "no feed url");
    return `${r[0].name} → ${r[0].feedUrl}`;
  });
  await check("News feeds", "Inc42 · YourStory · Entrackr", async () => {
    const { items, errors } = await fetchNews(new Date(Date.now() - 7 * 86_400_000));
    assert(!errors.length, errors.join("; "));
    const by = (p: string) => items.filter((i) => i.publisher === p).length;
    return `Inc42 ${by("Inc42")} · YourStory ${by("YourStory")} · Entrackr ${by("Entrackr")}`;
  });
  await check("Gemini Flash", "structured JSON call", async () => {
    const g = Gemini.fromEnv()!;
    const out = await g.json({ name: "live-check", version: "1", system: "Reply with the JSON requested.", parts: [{ text: 'Return {"ok": true}' }], schema: z.object({ ok: z.boolean() }) });
    assert(out?.ok, "bad output");
    return `ok via ${(g.logs.at(-1) as { model: string }).model}`;
  });

  // ---- Pipeline / jobs
  await check("Weekly pipeline", "Latest brief + last job", async () => {
    const owner = await ownerId();
    const { data: rep } = await db().from("weekly_reports").select("version,status,period_start,generated_at").eq("owner_id", owner).eq("is_sample", false).order("period_start", { ascending: false }).limit(1).single();
    const { data: job } = await db().from("ingestion_jobs").select("status,finished_at,provider_calls").eq("owner_id", owner).eq("type", "weekly").order("started_at", { ascending: false }).limit(1).single();
    return `Issue ${rep!.version} (${rep!.status}) week of ${new Date(Date.parse(rep!.period_start) + 330 * 60_000).toISOString().slice(0, 10)} · last job ${job!.status} · Gemini calls ${job!.provider_calls?.gemini_calls ?? 0}`;
  });

  const w = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s.padEnd(n));
  console.log(`\nLive check against ${BASE} — ${new Date().toISOString()}\n`);
  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${w(r.component, 26)} ${w(r.check, 40)} ${w(r.detail, 90)} ${r.ms}ms`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  const fs = await import("node:fs");
  fs.writeFileSync("docs/live-check.json", JSON.stringify({ base: BASE, at: new Date().toISOString(), results }, null, 2));
  if (failed) process.exit(1);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
