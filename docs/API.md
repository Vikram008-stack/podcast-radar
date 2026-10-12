# API

All routes live in `app/api/**`. Bodies and query strings are validated with Zod. Errors always use:

```json
{ "error": { "code": "bad_request", "message": "Human-readable reason" } }
```

No stack traces are returned. **Auth:** user routes need the Supabase session cookie of `ALLOWED_EMAIL` (otherwise `401 unauthorized`); reads go through the user's session so Postgres **RLS** (`owner_id = auth.uid()`) applies. Cron routes need `Authorization: Bearer $CRON_SECRET`.

| Method & path | Auth | Purpose |
|---|---|---|
| `GET /api/health` | public | `{ ok, database, integrations: { supabase, gemini, youtube, spotify, apple, cron }, time }` — booleans only, never values |
| `POST /api/auth/login` | public, 5 / 10 min / IP | `{ email }` → sends a magic link only if it equals `ALLOWED_EMAIL` (same response either way; `shouldCreateUser: false`) |
| `GET /api/dashboard` | user | latest brief: report meta, source health, featured guests/topics/sponsors, opportunity, counts, scan state |
| `GET /api/reports` | user | archive list (frozen snapshots + in-progress) |
| `GET /api/reports/[id]` | user | one report incl. full snapshot |
| `GET /api/podcasts?limit&offset` | user | configured shows (paginated) |
| `POST /api/podcasts` | user | `{ name, rss_url?, youtube?, spotify?, host_names[], house_brands[], apple_collection_id?, artwork_url? }` → validates every source live; active only if verified |
| `GET /api/podcasts/lookup?q=` | user, 30/min | Apple Podcasts Search (country=in) → `{ results: [{ collectionId, name, artist, feedUrl, artwork, lastRelease }] }` |
| `PATCH /api/podcasts/[id]` | user | edit feeds/hosts/house brands/`analyse_audio`/`active`/`min_episode_minutes`; feed changes re-validate; can't enable an unverified show (`409 not_verified`) |
| `DELETE /api/podcasts/[id]` | user | remove a show (episodes cascade; frozen reports keep their snapshot) |
| `POST /api/podcasts/[id]/validate` | user, 20 / 10 min | re-check RSS + YouTube now |
| `POST /api/podcasts/[id]/sync` | user, 4 / 10 min | fetch + analyse one show now (text only) |
| `GET /api/guests?report&q&limit&offset` | user | ranked guests from a report snapshot |
| `GET /api/guests/[id]?report` | user | one guest incl. appearance history + evidence |
| `POST /api/guests/[id]/outreach-draft` | user, AI: 6 / 10 min | `{ action: "generate", reportId? }` (Gemini) or `{ action: "save", subject, body }` |
| `GET /api/topics?report&q&limit&offset` | user | ranked topics |
| `GET /api/topics/[id]?report` | user | one topic incl. reference episodes, news, angles |
| `GET /api/sponsors?report&q&limit&offset` | user | confirmed + unconfirmed brands |
| `GET /api/sponsors/[id]?report` | user | placements + evidence + public stats |
| `POST /api/sponsors/[id]/pitch-draft` | user, AI: 6 / 10 min | same contract as outreach-draft |
| `GET /api/jobs?limit&offset` | user | ingestion jobs incl. `provider_calls` (YouTube units, RapidAPI requests, Gemini calls/tokens) |
| `POST /api/jobs/run` | user, once / 15 min (persisted) | "Run scan now": dispatches the GitHub Actions workflow if `GITHUB_DISPATCH_TOKEN` + `GITHUB_REPO` are set, else runs the chunked job on Vercel (audio queued) |
| `PATCH /api/settings` | user | `{ report_time: "HH:mm", timezone }` (day fixed to Monday) |
| `GET /api/cron/daily` | cron secret | keeps Supabase active; from Monday 07:00 IST, if the week's brief isn't ready, runs a checkpointed catch-up chunk and chains the next chunk (`?continue=1`) |

Drafts are never sent anywhere — the UI offers Copy only.
