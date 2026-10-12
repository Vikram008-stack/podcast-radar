// One-off: find each seeded show's Spotify id via the Spotify Scraper search (1 request per show).
// Usage: npx tsx --conditions=react-server scripts/spotify-lookup.ts
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { db, ownerId } = await import("@/lib/server/db");
  const { spotifySearchShow } = await import("@/lib/server/providers/spotify");
  const key = process.env.RAPIDAPI_KEY;
  if (!key) throw new Error("RAPIDAPI_KEY missing");
  const host = process.env.RAPIDAPI_SPOTIFY_HOST || "spotify-scraper.p.rapidapi.com";
  const sb = db();
  const owner = await ownerId();
  const shows = (await sb.from("podcasts").select("id,name,host_names,spotify_show_id").eq("owner_id", owner).is("spotify_show_id", null)).data ?? [];
  let used = 0;
  for (const s of shows) {
    const term = s.name.replace(/\(.*?\)/g, "").trim();
    const hits = await spotifySearchShow(term, { key, host });
    used++;
    const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
    const best = hits.find((h) => norm(h.name).includes(norm(term)) || norm(term).includes(norm(h.name)));
    console.log(`${s.name} → ${best ? `${best.id} (${best.name} / ${best.publisher})` : "no confident match"}`);
    if (best) await sb.from("podcasts").update({ spotify_show_id: best.id }).eq("id", s.id);
  }
  await sb.from("ingestion_jobs").insert({ owner_id: owner, type: "spotify_lookup", trigger: "cli", status: "succeeded", provider_calls: { rapidapi_requests: used }, finished_at: new Date().toISOString() });
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
