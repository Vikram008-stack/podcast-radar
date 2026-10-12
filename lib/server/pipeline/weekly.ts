import "server-only";
import { env } from "@/lib/env";
import type { SourceHealth } from "@/lib/shared/types";
import { Gemini } from "@/lib/server/ai/gemini";
import { db, must, ownerId } from "@/lib/server/db";
import { discoverSources } from "@/lib/server/discovery";
import { validatePodcast, type PodcastRow } from "@/lib/server/sources";
import { reportingPeriod, type Period } from "@/lib/time";
import { runAudio } from "./audio-step";
import { makeCtx, redact, type Ctx } from "./context";
import { Entities } from "./entities";
import { runExtraction } from "./extract";
import { loadFacts } from "./facts";
import { ingestPodcast, type IngestOutcome } from "./ingest";
import { runNews } from "./news-step";
import { reclassifyPlacements } from "./reclassify";
import { addBriefCopy, buildSnapshot } from "./report";

export type Trigger = "schedule" | "manual" | "catchup" | "cli";

export type RunOpts = {
  trigger: Trigger;
  /** "analyse" = GitHub Actions (ffmpeg); "mark" = Vercel catch-up → audio_pending */
  audio: "analyse" | "mark";
  /** Stop ingesting new shows after this many ms (chunked Vercel catch-up). */
  budgetMs?: number;
  now?: Date;
};

export type RunResult = {
  status: "succeeded" | "partial" | "failed" | "skipped" | "busy" | "continue";
  jobId: string | null;
  reportId?: string;
  periodKey: string;
  message: string;
};

type Checkpoint = { done?: string[]; outcomes?: Record<string, IngestOutcome>; lease_until?: string; phase?: string };

const LEASE_MS = 6 * 60_000;

async function claimJob(owner: string, key: string, trigger: Trigger, periodKey: string): Promise<{ id: string; checkpoint: Checkpoint } | null> {
  const sb = db();
  const now = Date.now();
  const lease = new Date(now + LEASE_MS).toISOString();
  const found = (await sb.from("ingestion_jobs").select("id,status,checkpoint,retries").eq("idempotency_key", key).maybeSingle()).data;
  if (!found) {
    const ins = await sb
      .from("ingestion_jobs")
      .insert({ owner_id: owner, type: "weekly", trigger, period_key: periodKey, status: "running", idempotency_key: key, checkpoint: { lease_until: lease } })
      .select("id,checkpoint")
      .single();
    if (ins.error) {
      if (/duplicate|unique/i.test(ins.error.message)) return null; // someone else won the race
      throw new Error(`create job: ${ins.error.message}`);
    }
    return { id: ins.data.id, checkpoint: ins.data.checkpoint as Checkpoint };
  }
  const cp = (found.checkpoint ?? {}) as Checkpoint;
  if (found.status === "running" && cp.lease_until && Date.parse(cp.lease_until) > now) return null; // busy
  const fresh = found.status !== "running"; // previous run finished/failed → start over (report not ready)
  const checkpoint: Checkpoint = fresh ? { lease_until: lease } : { ...cp, lease_until: lease };
  // optimistic claim
  const upd = await sb
    .from("ingestion_jobs")
    .update({ status: "running", trigger, checkpoint, retries: (found.retries ?? 0) + (fresh ? 1 : 0), finished_at: null, ...(fresh ? { started_at: new Date().toISOString(), log: [] } : {}) })
    .eq("id", found.id)
    .eq("status", found.status)
    .select("id")
    .maybeSingle();
  if (!upd.data) return null;
  return { id: found.id, checkpoint };
}

async function spotifyUsedLast30d(): Promise<number> {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const rows = (await db().from("ingestion_jobs").select("provider_calls").gte("started_at", since).limit(500)).data ?? [];
  return rows.reduce((n, r) => n + Number((r.provider_calls as { rapidapi_requests?: number })?.rapidapi_requests ?? 0), 0);
}

function health(p: PodcastRow, o: IngestOutcome | undefined, episodesInWindow: number): SourceHealth {
  let status: SourceHealth["status"];
  if (!p.active) status = "inactive";
  else if (p.validation_status === "needs_attention" && !o?.ok) status = "needs_attention";
  else if (!o) status = p.last_error ? "failed" : "ok";
  else status = o.ok ? (o.error ? "partial" : "ok") : "failed";
  return { podcastId: p.id, name: p.name, artwork: p.artwork_url, status, lastSuccessAt: p.last_success_at, lastError: p.last_error, episodesInWindow };
}

export async function runWeekly(opts: RunOpts): Promise<RunResult> {
  const started = Date.now();
  const sb = db();
  const owner = await ownerId();
  const period: Period = reportingPeriod(opts.now ?? new Date());
  const existingReport = (await sb.from("weekly_reports").select("id,status,version").eq("owner_id", owner).eq("is_sample", false).eq("period_start", period.start.toISOString()).maybeSingle()).data;
  const reportFrozen = existingReport?.status === "ready";

  if (reportFrozen && (opts.trigger === "schedule" || opts.trigger === "catchup")) {
    return { status: "skipped", jobId: null, reportId: existingReport!.id, periodKey: period.key, message: `Brief for ${period.key} already ready` };
  }
  // A frozen week can still be re-scanned manually; the frozen report is left untouched.
  // Hour-scoped so chunked continuations of the same manual re-scan reuse one job row.
  const key = reportFrozen ? `manual:${owner}:${period.key}:${new Date().toISOString().slice(0, 13)}` : `weekly:${owner}:${period.key}`;
  const job = await claimJob(owner, key, opts.trigger, period.key);
  if (!job) return { status: "busy", jobId: null, periodKey: period.key, message: "A scan for this period is already running" };

  const gemini = Gemini.fromEnv();
  const ctx: Ctx = makeCtx(owner, period, gemini);
  ctx.jobId = job.id;
  ctx.spotifyRemaining = Math.max(0, env().SPOTIFY_MONTHLY_BUDGET - (await spotifyUsedLast30d()));
  const cp: Checkpoint = { done: [], outcomes: {}, ...job.checkpoint };

  const finish = async (status: RunResult["status"], message: string, reportId?: string) => {
    const aiRows = (gemini?.logs ?? []).map((l) => ({ ...l, owner_id: owner, job_id: job.id, error: l.error ?? null }));
    if (aiRows.length) await sb.from("ai_runs").insert(aiRows);
    const prev = (await sb.from("ingestion_jobs").select("provider_calls,log").eq("id", job.id).single()).data;
    const pc = (prev?.provider_calls ?? {}) as Record<string, number>;
    const sum = (k: string, v: number) => (pc[k] ?? 0) + v;
    await sb
      .from("ingestion_jobs")
      .update({
        status: status === "continue" ? "running" : status === "skipped" || status === "busy" ? "succeeded" : status,
        checkpoint: { ...cp, lease_until: status === "continue" ? new Date().toISOString() : undefined, counters: ctx.counters },
        provider_calls: {
          youtube_units: sum("youtube_units", ctx.provider.youtube_units),
          rapidapi_requests: sum("rapidapi_requests", ctx.provider.rapidapi_requests),
          rss_fetches: sum("rss_fetches", ctx.provider.rss_fetches),
          news_fetches: sum("news_fetches", ctx.provider.news_fetches),
          gemini_calls: sum("gemini_calls", gemini?.calls ?? 0),
          gemini_tokens_in: sum("gemini_tokens_in", gemini?.tokensIn ?? 0),
          gemini_tokens_out: sum("gemini_tokens_out", gemini?.tokensOut ?? 0),
        },
        error_summary: status === "failed" || status === "partial" ? redact(message).slice(0, 1000) : null,
        log: [...((prev?.log as unknown[]) ?? []), ...ctx.log].slice(-400),
        finished_at: status === "continue" ? null : new Date().toISOString(),
      })
      .eq("id", job.id);
    return { status, jobId: job.id, reportId, periodKey: period.key, message };
  };

  try {
    // 1. load active podcasts  2. validate unverified sources
    const all = (must(await sb.from("podcasts").select("*").eq("owner_id", owner).eq("is_sample", false).order("name"), "podcasts") ?? []) as PodcastRow[];
    const active = all.filter((p) => p.active);
    const byId = new Map(active.map((p) => [p.id, p]));
    for (const p of active) {
      if (p.validation_status !== "unverified") continue;
      const v = await validatePodcast(p);
      await sb.from("podcasts").update({ validation_status: v.status, validation_detail: v.detail, ...v.patch }).eq("id", p.id);
      Object.assign(p, v.patch, { validation_status: v.status });
    }
    ctx.info(`run ${opts.trigger} for ${period.key}: ${active.length} active shows`);

    // 2b. weekly auto-discovery of missing YouTube channels / Spotify ids (verified against RSS titles)
    if (!opts.budgetMs) {
      const budget = { youtube: { units: 0 }, spotifyLeft: ctx.spotifyRemaining };
      for (const p of active) await discoverSources(p, budget, (m) => ctx.info(m));
      ctx.provider.youtube_units += budget.youtube.units;
      ctx.provider.rapidapi_requests += ctx.spotifyRemaining - budget.spotifyLeft;
      ctx.spotifyRemaining = budget.spotifyLeft;
    }

    // 3–5. fetch → normalise/dedupe → content hash (per-source isolation, checkpointed)
    const ents = await new Entities(owner).load();
    for (const p of active) {
      if (cp.done!.includes(p.id)) continue;
      if (opts.budgetMs && Date.now() - started > opts.budgetMs) {
        cp.phase = "ingest";
        return await finish("continue", `Ingested ${cp.done!.length}/${active.length} shows — continuing in next invocation`);
      }
      const outcome = await ingestPodcast(ctx, p);
      cp.outcomes![p.id] = outcome;
      cp.done!.push(p.id);
      await sb.from("ingestion_jobs").update({ checkpoint: { ...cp } }).eq("id", job.id);
    }
    if (opts.budgetMs && Date.now() - started > opts.budgetMs * 0.6) {
      cp.phase = "analyse";
      return await finish("continue", "Ingestion complete — analysis continues in next invocation");
    }

    // 6. Gemini text extraction (new/changed only)  6b. audio openings  9. news
    // Chunked (serverless) runs stop analysing at the budget and hand over to the next invocation.
    ctx.deadline = opts.budgetMs ? started + opts.budgetMs : null;
    // AUDIO_FIRST=true: hear episode openings before text analysis (useful when Gemini quota is scarce)
    if (process.env.AUDIO_FIRST === "true") await runAudio(ctx, ents, byId, opts.audio);
    await runExtraction(ctx, ents, byId);
    if (ctx.deferred > 0) {
      cp.phase = "analyse";
      return await finish("continue", `Analysed part of the backlog — ${ctx.deferred} episodes continue in the next invocation`);
    }
    await runAudio(ctx, ents, byId, opts.audio);
    await runNews(ctx, ents);
    // 8. sponsorship classification — rules re-applied to all stored evidence
    await reclassifyPlacements(ctx, byId);

    // Refresh podcast rows for health
    const fresh = (must(await sb.from("podcasts").select("*").eq("owner_id", owner).eq("is_sample", false), "podcasts") ?? []) as PodcastRow[];

    if (reportFrozen) {
      const failed = Object.values(cp.outcomes!).filter((o) => !o.ok).length;
      return await finish(failed ? "partial" : "succeeded", `Scan complete. This week's brief is frozen; new data will appear in next Monday's brief.`, existingReport!.id);
    }

    // 7–10. entity facts → metrics
    const facts = await loadFacts(owner, period);
    const counts = new Map<string, number>();
    for (const e of facts.episodes) if (+new Date(e.publishedAt) >= +period.start30) counts.set(e.podcastId, (counts.get(e.podcastId) ?? 0) + 1);
    const sources = fresh.filter((p) => p.active || counts.get(p.id)).map((p) => health(p, cp.outcomes![p.id], counts.get(p.id) ?? 0));
    const snap = buildSnapshot(facts, period, sources, {
      isSample: false,
      aiCalls: 0,
      audioAnalysed: ctx.counters.audioDone,
      audioSkipped: ctx.counters.audioSkipped + ctx.counters.audioPending,
      notes: [...ctx.notes],
    });
    // 11. brief copy (AI, labelled)
    await addBriefCopy(snap, gemini, (m) => ctx.warn(m));
    snap.stats.aiCalls = gemini?.calls ?? 0;

    // 12. validate
    if (snap.sources.length === 0) throw new Error("No active sources configured");
    if (snap.guests.some((g) => g.distinctShows > g.appearances)) throw new Error("metric invariant failed: shows > appearances");

    // 13. persist snapshot  14. mark ready — only when every episode in the window was analysed.
    // Otherwise the report stays "building" (shown as in-progress) and the next run completes it.
    const complete = ctx.counters.analysisIncomplete === 0;
    let version = existingReport?.version;
    if (!version) {
      const max = (await sb.from("weekly_reports").select("version").eq("owner_id", owner).eq("is_sample", false).order("version", { ascending: false }).limit(1)).data?.[0]?.version ?? 0;
      version = max + 1;
    }
    const rep = must(
      await sb
        .from("weekly_reports")
        .upsert(
          { owner_id: owner, period_start: period.start.toISOString(), period_end: period.end.toISOString(), version, status: complete ? "ready" : "building", snapshot: snap, is_sample: false, generated_at: snap.generatedAt },
          { onConflict: "owner_id,period_start,is_sample" },
        )
        .select("id")
        .single(),
      "persist report",
    );
    const failedSources = sources.filter((s) => s.status === "failed" || s.status === "needs_attention").length;
    const partial = failedSources > 0 || ctx.notes.length > 0 || !complete;
    ctx.info(`report ${period.key} v${version} ${complete ? "ready" : "building (analysis incomplete — will retry)"}`, { guests: snap.guests.length, topics: snap.topics.length, sponsors: snap.sponsors.length });
    return await finish(partial ? "partial" : "succeeded", partial ? `Brief ready with ${failedSources} source issue(s); ${ctx.notes.join(" ")}` : "Brief ready", rep.id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    ctx.error(`run failed: ${msg}`);
    return await finish("failed", msg);
  }
}
