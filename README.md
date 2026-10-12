# Podcast Ecosystem Radar 🎙️📡

A private weekly intelligence brief for **Aditya**, host of an independent podcast for Indian startup founders. Every **Monday 06:00 IST** it reads 10 Indian startup/founder podcasts — RSS, YouTube, Spotify **and the spoken opening of each episode** — and answers three questions with source evidence:

1. **Guests** — who appeared on monitored shows in the last 30 days, ranked so people on several shows (doing media rounds, easiest to book now) come first?
2. **Topics** — which themes did multiple shows cover this week (ride the wave or counter-programme)?
3. **Sponsors** — which brands are demonstrably paying to reach Indian startup podcast audiences?

Observed facts and AI interpretation are always labelled separately. Nothing is invented: every guest, topic and sponsor links to the episode, the show notes / description line, or the timestamp where it was **heard** in the audio.

- **Live app:** https://podcast-ecosystem-radar.vercel.app (private — sign-in for Aditya only)
- **Code:** https://github.com/Vikram008-stack/podcast-radar
- **Components Map (tested):** [`docs/components-map.png`](docs/components-map.png) · [PDF](docs/components-map.pdf) · [HTML](docs/components-map.html) · [text](docs/COMPONENTS_MAP.md)
- **Live check:** `npm run check:live` → 21/21 passed on production, 11 Oct 2026 ([results](docs/live-check.json))
- Docs: [Architecture](docs/ARCHITECTURE.md) · [API](docs/API.md) · [Data sources (verified)](docs/DATA_SOURCES.md) · [Metrics](docs/METRICS.md) · [Deployment](docs/DEPLOYMENT.md) · [Testing](docs/TESTING.md)

## How it works

```
GitHub Actions (Mon 06:00 IST, ffmpeg)          Vercel Cron 07:15 IST (keep-alive + catch-up)
        │                                                    │
        ▼                                                    ▼
RSS · YouTube Data API · Spotify Scraper · Inc42/YourStory/Entrackr  ──►  merge + dedupe
        ──► Gemini Flash: text extraction + listens to first 10 min of RSS audio
        ──► rules (sponsor disclosures, hosts, house brands) ──► deterministic ranking
        ──► Gemini Flash brief copy (cited) ──► frozen weekly snapshot ──► Next.js app
```

## Stack (100% free tier)
Next.js 16 · React 19 · TypeScript strict · Tailwind v4 · Supabase (Postgres, Auth, RLS) · Google Gemini Flash (`@google/genai`) · YouTube Data API v3 · RapidAPI Spotify Scraper BASIC · Apple Podcasts Search · public RSS · Vercel Hobby · GitHub Actions · Zod · Vitest · Playwright.

## Quick start (local)

```bash
npm install
```
```bash
cp .env.example .env.local   # then fill in the keys (see docs/DEPLOYMENT.md §4)
```
```bash
npm run db:migrate            # apply supabase/migrations
```
```bash
npm run seed                  # 10-show config + topic taxonomy (validates every feed live)
```
```bash
npm run pipeline:weekly       # first backfill (35 days); audio needs ffmpeg on PATH
```
```bash
npm run dev                   # http://localhost:3200 → sign in with ALLOWED_EMAIL
```

Optional: `npm run seed:sample` + `SAMPLE_DATA_MODE=true` shows a clearly fictional sample brief (local only, banner "Sample data · not live"; impossible in production).

## Configuring shows
**Settings → Podcast sources**: *Find by name* (Apple Podcasts returns the official RSS feed + artwork) or *Paste feeds* (RSS, YouTube URL/@handle, optional Spotify show URL). Every source is validated live before a show can be active. Per show: enable/disable, host names (never counted as guests), house brands (related-party, never sponsors), **Analyse audio**, minimum episode length. *Run scan now* starts the same weekly job (once per 15 min).

## Tests
```bash
npm run lint && npm run typecheck && npm test
```
```bash
RUN_INTEGRATION=1 npm run test:integration
```
```bash
npm run test:e2e
```
See [docs/TESTING.md](docs/TESTING.md) for what each suite covers and the observed results.

## Deployment
Vercel (web + daily cron), GitHub Actions (weekly brief with audio), Supabase (data + auth). Step-by-step with every env var and console link: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Known limitations
- **No YouTube captions**: the official API doesn't expose captions for channels we don't own; YouTube analysis uses title, description and chapters.
- **Audio = opening only, RSS only**: Gemini hears the first 10 minutes of RSS enclosures (GitHub Actions). Mid-roll ads later in an episode are only caught if they're also in the notes. YouTube/Spotify audio is never downloaded.
- **Spotify Scraper is unofficial** with 150 requests/month; it is a secondary source and failures are tolerated.
- **Free-tier rate limits**: Gemini free tier has small per-minute/day limits and occasional 503 "high demand" periods. The pipeline falls back across Flash models, keeps unfinished episodes pending, and only freezes a brief once every episode is analysed.
- **Quiet feeds are shown as quiet**: several seeded shows have no new RSS episodes in the last 35 days; counts reflect that honestly.
- News feeds only expose their latest ~20 items, so topic ↔ news links build up from the first run onward.
- Supabase's default mailer sends only a few magic links per hour (enough for one user).

## Status (11 Oct 2026)

| Feature | Implemented | Tested | Configured | Operational | Deployed |
|---|---|---|---|---|---|
| RSS ingestion (10 shows) | ✅ | ✅ unit + integration | ✅ | ✅ live run | ✅ |
| YouTube Data API (7 channels) | ✅ | ✅ | ✅ | ✅ live run | ✅ |
| Spotify Scraper (secondary, 7 shows) | ✅ | ✅ | ✅ | ✅ live run | ✅ |
| News (Inc42, YourStory, Entrackr) + tagging | ✅ | ✅ | ✅ | ✅ 80 headlines tagged | ✅ |
| Gemini text extraction / brief / drafts | ✅ | ✅ | ✅ | ✅ (Issue 1 built; drafts tested locally) | ✅ |
| Gemini audio analysis (ffmpeg) | ✅ | ✅ failure path | ✅ secrets set | ⏳ needs the GitHub Actions run | n/a |
| Weekly GitHub Actions workflow | ✅ | — | ✅ secrets | ⏳ file awaits a token with `workflow` scope | ⏳ |
| Vercel daily cron (keep-alive + catch-up) | ✅ | ✅ auth | ✅ | ⏳ first tick 07:15 IST | ✅ |
| Auth (magic link, ALLOWED_EMAIL, RLS) | ✅ | ✅ RLS integration | ⏳ Supabase redirect URL | ✅ local | ✅ |

Observed test results: lint 0 problems · typecheck 0 errors · unit 72/72 · integration 6/6 · Playwright 9/9 · `next build` ✅.
