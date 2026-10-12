import "server-only";
import type { Gemini } from "@/lib/server/ai/gemini";
import type { Period } from "@/lib/time";

export type LogLine = { at: string; level: "info" | "warn" | "error"; msg: string; data?: Record<string, unknown> };

export type Ctx = {
  owner: string;
  period: Period;
  jobId: string | null;
  gemini: Gemini | null;
  /** Earliest publish date we ingest (35-day backfill). */
  since: Date;
  provider: { youtube_units: number; rapidapi_requests: number; rss_fetches: number; news_fetches: number };
  counters: {
    newEpisodes: number;
    updatedEpisodes: number;
    extracted: number;
    needsReview: number;
    audioDone: number;
    audioSkipped: number;
    audioFailed: number;
    audioPending: number;
    newsArticles: number;
    /** episodes still awaiting text analysis after this run (errors / 503 / quota) */
    analysisIncomplete: number;
  };
  notes: string[];
  /** RapidAPI BASIC = 150 req/month; remaining budget for this run. */
  spotifyRemaining: number;
  /** Epoch ms after which a chunked (serverless) run must hand over to the next invocation. */
  deadline: number | null;
  /** Episodes left for the next chunk because the deadline was reached. */
  deferred: number;
  log: LogLine[];
  info: (msg: string, data?: Record<string, unknown>) => void;
  warn: (msg: string, data?: Record<string, unknown>) => void;
  error: (msg: string, data?: Record<string, unknown>) => void;
};

/** Never log secrets: strip anything that looks like a key/token from messages. */
export function redact(s: string): string {
  return s
    .replace(/(key|token|secret|apikey)=([^&\s]+)/gi, "$1=***")
    .replace(/AIza[0-9A-Za-z_\-]{20,}/g, "***")
    .replace(/sb_(secret|publishable)_[A-Za-z0-9_\-]+/g, "***");
}

export function makeCtx(owner: string, period: Period, gemini: Gemini | null): Ctx {
  const log: LogLine[] = [];
  const push = (level: LogLine["level"]) => (msg: string, data?: Record<string, unknown>) => {
    const line: LogLine = { at: new Date().toISOString(), level, msg: redact(msg), ...(data ? { data } : {}) };
    log.push(line);
    console.log(JSON.stringify({ scope: "pipeline", ...line }));
  };
  const since = new Date(Math.min(period.start30.getTime(), period.prevStart.getTime()) - 5 * 86_400_000);
  return {
    owner,
    period,
    jobId: null,
    gemini,
    since,
    provider: { youtube_units: 0, rapidapi_requests: 0, rss_fetches: 0, news_fetches: 0 },
    counters: { newEpisodes: 0, updatedEpisodes: 0, extracted: 0, needsReview: 0, audioDone: 0, audioSkipped: 0, audioFailed: 0, audioPending: 0, newsArticles: 0, analysisIncomplete: 0 },
    notes: [],
    spotifyRemaining: 0,
    deadline: null,
    deferred: 0,
    log,
    info: push("info"),
    warn: push("warn"),
    error: push("error"),
  };
}
