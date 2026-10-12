import { z } from "zod";

/**
 * Environment validation. Required keys throw at first use; optional
 * integration keys degrade gracefully and surface in Settings → Integrations.
 */
const blankToUndef = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const opt = z.preprocess(blankToUndef, z.string().optional());
const int = (d: number) => z.preprocess(blankToUndef, z.coerce.number().int().default(d));

const schema = z.object({
  NEXT_PUBLIC_APP_URL: opt,
  NEXT_PUBLIC_SUPABASE_URL: opt,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: opt,
  SUPABASE_SERVICE_ROLE_KEY: opt,
  ALLOWED_EMAIL: opt,
  GEMINI_API_KEY: opt,
  GEMINI_MODEL: z.preprocess(blankToUndef, z.string().default("gemini-3.6-flash")),
  GEMINI_FALLBACK_MODELS: opt,
  GEMINI_MAX_CALLS_PER_RUN: int(45),
  SPOTIFY_MONTHLY_BUDGET: int(120),
  YOUTUBE_API_KEY: opt,
  RAPIDAPI_KEY: opt,
  RAPIDAPI_SPOTIFY_HOST: z.preprocess(blankToUndef, z.string().default("spotify-scraper.p.rapidapi.com")),
  CRON_SECRET: opt,
  REPORT_TIMEZONE: z.preprocess(blankToUndef, z.string().default("Asia/Kolkata")),
  REPORT_HOUR: int(6),
  REPORT_MINUTE: int(0),
  MIN_EPISODE_MINUTES: int(20),
  AUDIO_CLIP_MINUTES: int(10),
  AUDIO_MAX_EPISODES_PER_RUN: int(40),
  SAMPLE_DATA_MODE: opt,
  PUBLIC_READ: opt,
  PUBLIC_EDIT: opt,
  VERCEL_ENV: opt,
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;
export function env(): Env {
  if (!cached) cached = schema.parse(process.env);
  return cached;
}

/** For tests: force re-read of process.env. */
export function resetEnvCache() {
  cached = null;
}

export function requireEnv<K extends keyof Env>(key: K): NonNullable<Env[K]> {
  const v = env()[key];
  if (v === undefined || v === null || v === "") {
    throw new Error(`Missing required environment variable ${String(key)}`);
  }
  return v as NonNullable<Env[K]>;
}

/** Sample mode is impossible in production. */
export function sampleMode(): boolean {
  const e = env();
  if (e.VERCEL_ENV === "production") return false;
  return e.SAMPLE_DATA_MODE === "true";
}

/** Anyone with the link can view the brief (read-only). Editing still needs Aditya’s sign-in. */
export function publicRead(): boolean {
  return env().PUBLIC_READ === "true" || env().PUBLIC_EDIT === "true";
}

/** Anyone with the link can also edit (drafts, Settings, scans). Implies public read. */
export function publicEdit(): boolean {
  return env().PUBLIC_EDIT === "true";
}

export function geminiModels(): string[] {
  const e = env();
  const extra = (e.GEMINI_FALLBACK_MODELS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [e.GEMINI_MODEL, ...extra.filter((m) => m !== e.GEMINI_MODEL)];
}

export type IntegrationStatus = { key: string; label: string; configured: boolean; note: string };

export function integrationStatus(): IntegrationStatus[] {
  const e = env();
  return [
    { key: "supabase", label: "Supabase", configured: !!(e.NEXT_PUBLIC_SUPABASE_URL && e.SUPABASE_SERVICE_ROLE_KEY), note: "Database + sign-in" },
    { key: "gemini", label: "Gemini Flash", configured: !!e.GEMINI_API_KEY, note: e.GEMINI_API_KEY ? geminiModels().join(" → ") : "Add GEMINI_API_KEY" },
    { key: "youtube", label: "YouTube Data API v3", configured: !!e.YOUTUBE_API_KEY, note: e.YOUTUBE_API_KEY ? "Official API, no search.list" : "Add YOUTUBE_API_KEY — video-first shows paused" },
    { key: "spotify", label: "Spotify Scraper (RapidAPI)", configured: !!e.RAPIDAPI_KEY, note: e.RAPIDAPI_KEY ? "Secondary source, BASIC plan" : "Optional — add RAPIDAPI_KEY" },
    { key: "apple", label: "Apple Podcasts lookup", configured: true, note: "No key needed" },
    { key: "cron", label: "Cron secret", configured: !!e.CRON_SECRET, note: "Protects scheduled routes" },
  ];
}
