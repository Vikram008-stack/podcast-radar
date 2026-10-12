# Deployment (all free tier)

## 1. Supabase (database + sign-in)
1. https://supabase.com/dashboard → **New project** (region Mumbai `ap-south-1`).
2. **Project Settings → API Keys**: copy *Project URL*, *Publishable key* (→ `NEXT_PUBLIC_SUPABASE_ANON_KEY`) and a *Secret key* (→ `SUPABASE_SERVICE_ROLE_KEY`).
3. **Connect → Session pooler** URI (IPv4) → `SUPABASE_DB_URL` (local tooling only).
4. Apply schema: `npm run db:migrate` → seed shows + topics: `npm run seed`.
5. **Authentication → Sign In / Providers → Email**: keep *Email* enabled, turn **Allow new users to sign up = OFF** (the app also enforces `ALLOWED_EMAIL`).
6. **Authentication → URL Configuration**: *Site URL* = your Vercel URL; add `https://<your-app>.vercel.app/auth/callback` and `http://localhost:3200/auth/callback` to *Redirect URLs*.
7. Default Supabase email can only send a few magic links per hour — fine for one user.

## 2. Vercel (web app + daily cron)
The project is deployed with the Vercel CLI from a clean `git archive` (see README). Environment variables (Project → Settings → Environment Variables → Production):

| Name | Value |
|---|---|
| `NEXT_PUBLIC_APP_URL` | `https://<your-app>.vercel.app` |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | from Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase secret key |
| `ALLOWED_EMAIL` | Aditya's email |
| `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODELS` | AI Studio key, `gemini-3.6-flash`, `gemini-3.5-flash,gemini-3.7-flash` |
| `YOUTUBE_API_KEY` | YouTube Data API v3 key |
| `RAPIDAPI_KEY`, `RAPIDAPI_SPOTIFY_HOST` | RapidAPI key, `spotify-scraper.p.rapidapi.com` |
| `CRON_SECRET` | long random string — Vercel Cron sends it as `Authorization: Bearer …` |
| `GITHUB_DISPATCH_TOKEN`, `GITHUB_REPO` | *(optional)* lets "Run scan now" start the GitHub Actions run |

`vercel.json` registers one cron: `45 1 * * *` (07:15 IST daily) → `/api/cron/daily` (Hobby allows daily crons).

## 3. GitHub Actions (weekly brief, with audio)
Repo → **Settings → Secrets and variables → Actions**:
- **Secrets**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ALLOWED_EMAIL`, `GEMINI_API_KEY`, `YOUTUBE_API_KEY`, `RAPIDAPI_KEY`.
- **Variables** (optional): `GEMINI_MODEL`, `GEMINI_FALLBACK_MODELS`, `AUDIO_CLIP_MINUTES`, `AUDIO_MAX_EPISODES_PER_RUN`, `MIN_EPISODE_MINUTES`.

The workflow `.github/workflows/weekly-brief.yml` runs **Mondays 00:30 UTC = 06:00 IST** and on demand (**Actions → Weekly brief → Run workflow**). Use the manual run for the first backfill (35 days).

> **GitHub disables scheduled workflows in repositories with no activity for 60 days.** If that happens: Actions → *Weekly brief* → **Enable workflow** (or push any commit). The Vercel daily catch-up keeps producing briefs meanwhile (text-only; audio is queued as `audio_pending` and analysed on the next Actions run).

If Aditya changes the report time in Settings, also edit the cron line in the workflow (GitHub cron is UTC: IST − 5:30).

## 4. Keys — where to get them (free, no billing)
- **Gemini**: https://aistudio.google.com/apikey → *Create API key*.
- **YouTube Data API v3**: https://console.cloud.google.com/apis/library/youtube.googleapis.com → *Enable* → https://console.cloud.google.com/apis/credentials → *Create credentials → API key* → restrict to *YouTube Data API v3*. 10,000 units/day.
- **RapidAPI Spotify Scraper**: https://rapidapi.com/DataFanatic/api/spotify-scraper → *Pricing → BASIC $0 → Subscribe* → copy `X-RapidAPI-Key` from *Endpoints*. 150 requests/month.
- **CRON_SECRET**: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
