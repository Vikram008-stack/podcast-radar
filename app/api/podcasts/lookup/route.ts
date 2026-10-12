import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { apiError, rateLimit, requireApiUser, unauthorized } from "@/lib/server/api";
import { db } from "@/lib/server/db";
import { searchApple } from "@/lib/server/providers/apple";
import { spotifySearchShow } from "@/lib/server/providers/spotify";
import { searchChannels } from "@/lib/server/providers/youtube";

/**
 * Settings helper: find a show by name.
 *  source=apple   → official RSS feed + artwork (free, no key)
 *  source=youtube → channels (search.list = 100 units of the 10,000/day)
 *  source=spotify → Spotify show ids (1 RapidAPI request of the 150/month)
 */
export async function GET(req: NextRequest) {
  const user = await requireApiUser();
  if (!user) return unauthorized();
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const source = req.nextUrl.searchParams.get("source") ?? "apple";
  if (q.length < 2 || q.length > 100) return apiError(400, "bad_request", "Type at least 2 characters");
  const paid = source !== "apple";
  if (!rateLimit(`lookup:${source}:${user.id}`, paid ? 10 : 30, paid ? 60 * 60_000 : 60_000)) {
    return apiError(429, "rate_limited", paid ? "Search limit reached for this hour (protects the free quota)" : "Slow down a little");
  }
  try {
    if (source === "youtube") {
      const key = env().YOUTUBE_API_KEY;
      if (!key) return apiError(503, "not_configured", "YOUTUBE_API_KEY is not configured");
      const quota = { units: 0 };
      const hits = await searchChannels(q, key, quota, 6);
      await db().from("ingestion_jobs").insert({ owner_id: user.id, type: "lookup", trigger: "manual", status: "succeeded", provider_calls: { youtube_units: quota.units }, finished_at: new Date().toISOString() });
      return NextResponse.json({ results: hits.map((h) => ({ kind: "youtube", id: h.id, name: h.title, artist: h.description.slice(0, 80) || null, artwork: h.thumbnail, url: `https://www.youtube.com/channel/${h.id}` })) });
    }
    if (source === "spotify") {
      const key = env().RAPIDAPI_KEY;
      if (!key) return apiError(503, "not_configured", "RAPIDAPI_KEY is not configured");
      const hits = await spotifySearchShow(q, { key, host: env().RAPIDAPI_SPOTIFY_HOST });
      await db().from("ingestion_jobs").insert({ owner_id: user.id, type: "lookup", trigger: "manual", status: "succeeded", provider_calls: { rapidapi_requests: 1 }, finished_at: new Date().toISOString() });
      return NextResponse.json({ results: hits.slice(0, 8).map((h) => ({ kind: "spotify", id: h.id, name: h.name, artist: h.publisher, artwork: null, url: `https://open.spotify.com/show/${h.id}` })) });
    }
    const hits = await searchApple(q, 8);
    return NextResponse.json({ results: hits.map((h) => ({ kind: "apple", ...h })) });
  } catch {
    return apiError(502, "search_unavailable", `${source} search is unavailable right now`);
  }
}
