# Architecture & decisions

See [`COMPONENTS_MAP.md`](COMPONENTS_MAP.md) for the component inventory and flow.

## Stack
- **Next.js 16.4 (App Router) + React 19 + TypeScript strict**, Tailwind v4 tokens + a ported plain-CSS design system from the Figma Make prototype (`app/globals.css`), `next/font` DM Sans + Newsreader.
- **Supabase** Postgres + Auth (`@supabase/ssr` cookies), migrations in `supabase/migrations`, RLS `owner_id = auth.uid()` on every table.
- **Gemini Flash** via `@google/genai` (only AI in the app). **Zod** validates every external response, every Gemini output and every request body.
- **Vitest** (unit + integration) and **Playwright** (UI smoke).

## Layout
```
app/(app)/…            authenticated pages (Home, guests, topics, sponsors, reports, settings)
app/api/**             route handlers (see API.md)
app/login, app/auth/*  magic-link sign-in
components/            UI (cards, shell, directory, draft editor, settings client, primitives)
lib/                   pure logic: time, metrics, sponsors, names, dedupe, text, env, shared types
lib/server/            server-only: db, providers/*, ai/* (client + versioned prompts), pipeline/*
scripts/               migrate, seed, seed-sample, pipeline-weekly, validate-sources, spotify-lookup
supabase/migrations    schema + RLS
.github/workflows      weekly-brief.yml (primary scheduler)
```

## Key decisions (and why)

1. **GitHub Actions is the primary weekly runner.** It has ffmpeg and no serverless timeout, so the full run (incl. audio) happens there. Vercel only does a chunked, checkpointed **catch-up** (one show per step, self-chaining) and the Supabase keep-alive. Vercel Hobby crons are daily, so the catch-up cron runs every day at 07:15 IST and acts only when the week's brief is missing.
2. **Frozen snapshots.** Each weekly brief is a JSON snapshot in `weekly_reports`. Pages render from the snapshot, so a brief never changes after it is ready and the archive is exact. A brief is marked *ready* only when every episode in the window was analysed (Gemini 503/quota → stays *in progress*, next run completes it).
3. **One batched Gemini call per 8 episodes** returns guests + topics + brand candidates (three versioned prompt parts composed). This keeps a full weekly run at ~10–15 calls on the free tier. Audio uses 1 call per episode and stops 2 calls before the per-run budget so the brief copy always fits. Quota (429) or overload (503) on the primary model falls over to the next free-tier Flash model.
4. **Anti-hallucination by construction.** Gemini must quote verbatim excerpts; the pipeline checks each excerpt exists in the stored source text before saving it, attaches the exact source URL, stores ≤ 25 words, and drops AI claims whose `source_ids` are not in the payload.
5. **Rules first for sponsors.** Classification is a regex rule engine over stored evidence (written + spoken, English/Hinglish/Hindi). Gemini only proposes candidates. Rules are re-run over stored evidence every week (no AI cost), so rule fixes and house-brand edits apply retroactively.
6. **Spotify Scraper is secondary and budgeted** (150 req/month on BASIC → ≤ 1 request/show/run, monthly budget tracked in `ingestion_jobs.provider_calls`; 429 never breaks a run).
7. **Cross-platform dedupe** (title Jaccard ≥ 0.6 or containment, ≤ 3 days apart, never two sources of the same provider) — counts are always per merged episode.
8. **Auth**: Supabase magic link, `shouldCreateUser: false`, server-side `ALLOWED_EMAIL` check on sign-in, in the callback, and on every page/API (`currentUser()`); RLS as a second wall. Cron routes use a constant-time `CRON_SECRET` check.
9. **Next 16 specifics**: `proxy.ts` (renamed from middleware) refreshes the session and redirects signed-out users; `cacheComponents` is off because every page is private and per-user; `after()` runs background chunks after responding.
10. **Design**: the Figma Make prototype (Vite + one App.tsx) was ported into routes/components keeping its tokens, radii and layout; all text ≥ 12 px, muted colour darkened for AA, stock photos replaced with feed artwork / initials avatars, every control wired to a real action.

## Data model (abridged)
`podcasts` → `episodes` (merged) → `episode_sources` (rss/youtube/spotify) · `guests` + `guest_aliases` + `guest_appearances` (evidence) · `topics` + `episode_topics` + `news_topics` · `brands` + `sponsorship_placements` + `placement_evidence` (type, excerpt, URL, audio timestamp, matched rule) · `news_articles` · `ai_runs` · `ingestion_jobs` (idempotency key, checkpoint, provider calls, log) · `weekly_reports` (frozen snapshot) · `drafts` · `app_settings`.

## Security notes
- Secrets only in server env (Vercel/GitHub secrets); `NEXT_PUBLIC_*` holds only the Supabase URL + publishable key (RLS-protected).
- Feed/description/audio content is framed as untrusted data in every prompt.
- Structured logs redact key/token patterns; API errors never include stack traces.
- Security headers (frame deny, nosniff, referrer policy, permissions policy).
