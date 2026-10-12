# Testing

| Command | What it runs |
|---|---|
| `npm run lint` | ESLint (Next + React hooks rules) |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm test` | Vitest unit tests (integration tests auto-skip without `RUN_INTEGRATION=1`) |
| `RUN_INTEGRATION=1 npm run test:integration` | integration tests against the real Supabase project with a throw-away owner (deleted afterwards) and mocked providers/Gemini |
| `npm run test:e2e` | Playwright UI smoke tests on a local dev server (port 3201) in sample mode; uses the installed Edge (`PW_CHANNEL=chrome` for Chrome) |
| `npm run build` | production build |

## Unit (72 tests)
- `time.test.ts` — IST week boundaries (Sunday 23:59 / Monday 00:00 / UTC-still-Sunday), 30/7-day windows, due time, formatting.
- `metrics.test.ts` — guest/topic/sponsor ranking incl. every tie-break, topic change + "New", featured eligibility without padding, opportunity selection.
- `sponsors.test.ts` — every written disclosure phrase, spoken Hinglish/Hindi phrases, affiliate codes/links, AI-cannot-confirm, house-brand exclusion, regression for "with code RAJ2026".
- `sources.test.ts` — clip filter (ISO durations), RSS↔YouTube↔Spotify dedupe (merge / no-merge cases), Apple lookup parsing, verified Spotify response parsing, RSS durations.
- `ai-and-names.test.ts` — alias resolution (Nithin/Nitin), conflicting-company review flag, host exclusion, Zod validation of Gemini episode-intel / audio / brief outputs, drop of unsourced claims, evidence excerpt verification + 25-word window, HTML stripping, missing-key behaviour, sample mode impossible in production.

## Integration (6 tests)
`tests/integration/pipeline.test.ts`
- one feed failing (500) → the other shows succeed, source marked failed, run = partial
- Spotify 429 → run completes, request still counted
- audio failure (ffmpeg error) → episodes `audio_status=failed`, text results intact
- idempotency: scheduled re-run → `skipped`; manual re-run of a frozen week keeps the same report; 1 report, no duplicate episodes
- RLS: a second signed-in user sees 0 rows and cannot insert into another owner's data; no-session client sees nothing
- cron route rejects missing/wrong secret with the standard error shape

## UI (9 Playwright tests)
navigation through every sidebar item, ranked-signals search + tabs, guest search → detail (evidence + draft editor), sponsor/topic detail (observed vs AI sections, "Insufficient public data"), 404 for unknown ids, sample-mode banner + honest empty slots, mobile sidebar, **Settings add-by-feed → validated → disable → remove** (real feed, temporary row), Apple Podcasts lookup.

## Results observed on 11 Oct 2026 (local, Windows, Node 22)
- `npm run lint` — 0 problems
- `npm run typecheck` — 0 errors
- `npm test` — 72 passed (unit)
- `RUN_INTEGRATION=1 npm run test:integration` — 6 passed
- `npm run test:e2e` — 9 passed
- `npm run build` — see README "Status" (re-run before each deploy)

## Manual checks done against live sources
- 10 RSS feeds, 7 YouTube channels, Spotify Scraper episode endpoint, 3 news feeds — `docs/DATA_SOURCES.md`.
- Pipeline run on live data produced Issue 1 (28 Sep – 04 Oct 2026); 5 guests and 5 sponsor placements spot-checked against their source links (`docs/DATA_SOURCES.md`).
- **Audio check:** requires ffmpeg, which runs in GitHub Actions (not on this Windows machine). Status of the first audio run is recorded in the README "Status" section — it is not claimed until observed.
