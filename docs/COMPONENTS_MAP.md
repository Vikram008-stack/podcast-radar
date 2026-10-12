# Components Map — Podcast Ecosystem Radar

> **Note on provenance.** The build prompt refers to a provided `docs/COMPONENTS_MAP.md`, but no such file was in the repository or in the shared files (only a Components Map for a different case). This map was therefore written from the approved build prompt and reflects the implementation as built. Visual version: [`components-map.html`](components-map.html).

## One-line purpose
Every Monday 06:00 IST, turn 10 Indian startup podcasts (RSS + YouTube + Spotify + the spoken opening of each RSS episode) into one evidence-backed brief for Aditya: **who to book, what to talk about, who might sponsor**.

## Components

| # | Component | Type | Tech / service (free tier) | Inputs | Outputs |
|---|---|---|---|---|---|
| 1 | **Scheduler (primary)** | Automation | GitHub Actions `weekly-brief.yml`, cron `30 0 * * 1` (Mon 06:00 IST), ffmpeg on ubuntu runner | schedule / workflow_dispatch | runs `npm run pipeline:weekly` |
| 2 | **Scheduler (fallback + keep-alive)** | Automation | Vercel Cron → `/api/cron/daily` 07:15 IST, `CRON_SECRET` | daily tick | DB keep-alive; chunked catch-up if the brief is late |
| 3 | **Source registry** | Config (DB) | Supabase `podcasts` + Settings page | Aditya's edits; Apple Podcasts lookup | active shows, hosts, house brands, audio toggle |
| 4 | **RSS adapter** | Ingestion | `rss-parser`, ETag/Last-Modified | feed URLs | episodes + show notes + MP3 enclosure |
| 5 | **YouTube adapter** | Ingestion | YouTube Data API v3 (channels/playlistItems/videos only) | channel handle/id | full-length videos (≥ 20 min), descriptions, public stats |
| 6 | **Spotify adapter** | Ingestion (secondary) | RapidAPI Spotify Scraper BASIC (150 req/mo, budget 120) | Spotify show id | episode descriptions |
| 7 | **Apple lookup** | Settings helper | iTunes Search/Lookup (no key) | show name | official RSS feed + artwork |
| 8 | **News adapter** | Ingestion | Inc42 / YourStory / Entrackr RSS | — | headlines for topics |
| 9 | **Normaliser + dedupe** | Processing | TS (`lib/dedupe.ts`) | provider items | one merged episode, all source links, content hash |
| 10 | **Text intelligence** | AI | Gemini Flash (`gemini-3.6-flash`, fallbacks 3.5/3.7) structured JSON + Zod | title + notes (capped) | guests, topics, brand candidates (verbatim excerpts) |
| 11 | **Audio intelligence** | AI (audio) | ffmpeg (first 10 min, mono 16 kHz) → Gemini Flash inline audio | MP3 enclosure URL | spoken sponsor reads + guest intros with timestamps |
| 12 | **Entity resolution** | Processing | `lib/names.ts`, `guest_aliases` | names + companies | merged guests; conflicts flagged for review |
| 13 | **Sponsor rules engine** | Processing | `lib/sponsors.ts` (rules first, AI second) | stored evidence | confirmed / affiliate / probable / related-party |
| 14 | **Metrics + ranking** | Processing | `lib/metrics.ts` (pure, tested) | facts | ranked guests / topics / sponsors, opportunity pick |
| 15 | **Brief writer** | AI | Gemini Flash, 1 call / week | ranked payload with ids | labelled AI claims with `source_ids` (unsourced dropped) |
| 16 | **Report store** | Data | Supabase `weekly_reports` (frozen jsonb snapshot) | snapshot | Home, Reports archive, detail pages |
| 17 | **Web app** | Frontend | Next.js 16 App Router on Vercel Hobby, Figma Make design | snapshot + Settings | Home, Guests, Topics, Sponsors, Settings, Reports |
| 18 | **Auth** | Security | Supabase email magic link + `ALLOWED_EMAIL` + RLS | email | session for Aditya only |
| 19 | **Draft assistant** | AI | Gemini Flash on demand (rate-limited) | guest/sponsor evidence | editable outreach / pitch drafts (Copy only) |
| 20 | **Observability** | Ops | `ingestion_jobs`, `ai_runs` tables, Settings → Collection health | every run | per-source status, quotas used, errors (no secrets) |

## Flow

```
Mon 06:00 IST ── GitHub Actions ─┐                ┌── Vercel Cron 07:15 IST (catch-up if late)
                                 ▼                ▼
  Settings (Apple lookup) → podcasts ──► Ingestion: RSS · YouTube · Spotify · News
                                             │ (per-source isolation, retries, checkpoints)
                                             ▼
                              Normalise + dedupe + content hash (skip unchanged)
                                   │                          │
                                   ▼                          ▼
                     Gemini text extraction        ffmpeg clip → Gemini audio (RSS only)
                                   └──────────┬───────────────┘
                                              ▼
                   Entity resolution → Sponsor rules → Metrics & ranking (deterministic)
                                              ▼
                     Gemini brief copy (labelled, cited) → frozen weekly_reports snapshot
                                              ▼
                     Next.js app (Home · Guests · Topics · Sponsors · Reports · Settings)
```

## Boundaries
- AI (Gemini) never produces numbers, never decides "Confirmed", and every AI sentence cites stored source ids.
- Only RSS audio is analysed, only its opening, never stored. YouTube/Spotify audio is never touched.
- Single user; no teams, no email delivery.
