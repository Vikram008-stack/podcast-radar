import { NextResponse, type NextRequest } from "next/server";
import { apiError, rateLimit, requireApiUser, unauthorized } from "@/lib/server/api";
import { Gemini } from "@/lib/server/ai/gemini";
import { db, ownerId } from "@/lib/server/db";
import { makeCtx } from "@/lib/server/pipeline/context";
import { Entities } from "@/lib/server/pipeline/entities";
import { runExtraction } from "@/lib/server/pipeline/extract";
import { ingestPodcast } from "@/lib/server/pipeline/ingest";
import type { PodcastRow } from "@/lib/server/sources";
import { reportingPeriod } from "@/lib/time";

export const maxDuration = 120;

/** Fetch + analyse one show now (text only). Results appear in the next brief. */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (!user) return unauthorized();
  if (!rateLimit(`sync:${user.id}`, 4, 10 * 60_000)) return apiError(429, "rate_limited", "Sync is limited to 4 per 10 minutes");
  const { id } = await ctx.params;
  const owner = await ownerId();
  if (owner !== user.id) return unauthorized();
  const { data: p } = await db().from("podcasts").select("*").eq("id", id).eq("owner_id", owner).maybeSingle();
  if (!p) return apiError(404, "not_found", "Show not found");
  if (!p.active) return apiError(409, "inactive", "Enable the show first");
  const c = makeCtx(owner, reportingPeriod(), Gemini.fromEnv());
  c.spotifyRemaining = 1;
  const outcome = await ingestPodcast(c, p as PodcastRow);
  const ents = await new Entities(owner).load();
  await runExtraction(c, ents, new Map([[p.id, p as PodcastRow]]));
  await db().from("ingestion_jobs").insert({
    owner_id: owner,
    type: "sync",
    trigger: "manual",
    status: outcome.ok ? "succeeded" : "failed",
    provider_calls: { ...c.provider, gemini_calls: c.gemini?.calls ?? 0 },
    error_summary: outcome.error ?? null,
    log: c.log,
    finished_at: new Date().toISOString(),
  });
  if (!outcome.ok) return apiError(502, "sync_failed", outcome.error ?? "Sync failed");
  return NextResponse.json({ message: `${p.name}: ${outcome.fetched} items fetched, ${outcome.created} new episodes, ${c.counters.extracted} analysed`, outcome });
}
