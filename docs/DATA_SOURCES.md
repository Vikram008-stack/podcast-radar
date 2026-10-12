# Data sources — what was verified, and how

All checks below were run live on **11 Oct 2026** from this repo (scripts in `scripts/`). Nothing here is assumed.

## Podcast feeds (Apple Podcasts Search → official RSS → fetched & parsed)

Found with `https://itunes.apple.com/search?media=podcast&entity=podcast&country=in&term=…`, then each feed was fetched and parsed with `rss-parser`.

| Show | RSS feed (verified) | Items | Latest item | Enclosure |
|---|---|---|---|---|
| The Neon Show | `https://feeds.buzzsprout.com/1601695.rss` (given; Apple search did not surface it, fetch OK) | 398 | 09 Oct 2026 | audio/mpeg |
| Founders Unfiltered | `https://anchor.fm/s/1471bde4/podcast/rss` | 208 | 01 Mar 2026 | audio/mpeg |
| The Desi VC | `https://anchor.fm/s/db9d322c/podcast/rss` (Apple id 1497417574) | 155 | 01 Apr 2026 | audio/mpeg |
| SeedToScale (Accel) | `https://feeds.simplecast.com/JPQYcVsK` (Apple id 1364412685) | 122 | 15 Apr 2026 | audio/mpeg |
| First Principles (The Ken) | `https://feeds.transistor.fm/first-principles-261f2954-4e6b-4315-973d-17d02efc10f6` (Apple id 1639125773) | 71 | 28 Sep 2026 | audio/mpeg |
| Founder Thesis | `https://feeds.zencastr.com/f/mbqvPYFP.rss` (Apple id 1509981658) | 457 | 07 Oct 2026 | **video/mp4** |
| Indian Silicon Valley | `https://anchor.fm/s/b025ebc/podcast/rss` (Apple id 1527294982) | 232 | 29 Jun 2025 | audio/mpeg |
| People by WTF | `https://feeds.hubhopper.com/db41907e6c28518ffe336b392c715ef1.rss` (Apple id 1819856014) | 48 | 16 Jul 2026 | audio/mpeg |
| Figuring Out (Raj Shamani) | `https://anchor.fm/s/f5347ab0/podcast/rss` (Apple id 1501941375) | 622 | 10 Oct 2026 | audio/mpeg |
| The Barbershop with Shantanu | `https://media.rss.com/thebarbershopwithshantanu/feed.xml` (Apple id 1657402141) | 143 | 17 Jul 2026 | audio/mpeg |

Observations that shape the product:
- Several RSS feeds are quiet (Founders Unfiltered, Desi VC, SeedToScale, ISV, WTF, Barbershop have no RSS episode in the last 35 days). This is real — counts reflect it; nothing is padded. YouTube fills part of the gap.
- Founder Thesis publishes **video/mp4** enclosures. The audio clipper reads only the audio stream of the first minutes (`-vn`), so it still works.

## YouTube Data API v3 (official) — channels verified with `channels.list`

Run by `npm run sources:validate` (8 units) and a statistics check (1 unit). `search.list` is never used.

| Show | Handle | Channel id | Videos | Subscribers |
|---|---|---|---|---|
| Figuring Out | @rajshamani | UCzwCEE_PchiBULMnAJqhGVg | 2,583 | 19.8M |
| People by WTF | @nikhil.kamath | UCnC8SAZzQiBGYVSKZ_S3y4Q | 1,946 | 2.35M |
| Indian Silicon Valley | @indiansiliconvalley | UCOu85KXcYcEClNAeiKrDA6Q | 652 | 117K |
| Founder Thesis | @founderthesis | UChwUqkuczHA_d-TV3n0LN9w | 839 | 20.1K |
| Founders Unfiltered | @ajuniorvc | UCLejFRgs5-Gfh8TNA1uxMLA | 291 | 15.1K |
| The Desi VC | @thedesivc | UC6QwqaxfRpMyAk0sFbLej5g | 44 | 1.66K |
| The Neon Show | @theneonshow | UCH1O_Hg_DJEUpThWFEiMpMg | 243 | 297 |
| ~~The Barbershop~~ | ~~@thebarbershopwithshantanu~~ | UCta-0NnMg1q3g3bZN_yS65A | **0** | 6 |

- The Barbershop handle resolves to an **empty placeholder channel (0 videos)** — so it was removed; the show runs on its verified RSS feed. If Aditya knows the real channel, paste it in Settings.
- SeedToScale and First Principles have no dedicated channel configured (The Ken's channel mixes other formats); they run on RSS.
- Captions for channels we don't own are not available through the official API, so we use title, description and chapters only.
- Quota: a weekly run costs ~3 units per channel (channels.list once, cached; playlistItems.list; videos.list) ≈ 25 units vs 10,000/day.

## Spotify Scraper (RapidAPI, DataFanatic, BASIC $0) — **verified, used as a secondary source**

Request (headers server-side only):
```
GET https://spotify-scraper.p.rapidapi.com/v1/podcast/episodes?showId=73VanEvg9Rhp2SOOJPFaav
X-RapidAPI-Key: ***            X-RapidAPI-Host: spotify-scraper.p.rapidapi.com
```
Trimmed response (The Neon Show, 11 Oct 2026):
```json
{ "status": true, "errorId": "Success",
  "episodes": { "totalCount": 100, "items": [ {
    "type": "episode", "id": "7lXij9LZ6GpW0LM729kMzk",
    "name": "How AWS, AngleList and Now AI Killed The Old VC Playbook | Nakul, Audacious",
    "shareUrl": "https://open.spotify.com/episode/7lXij9LZ6GpW0LM729kMzk",
    "date": "2026-10-09T11:30:00Z",
    "description": "From a boutique industry of ~20 firms to today …",
    "htmlDescription": "<p>…</p>", "durationMs": 3519000, "durationText": "…" } ] } }
```
- The parameter is `showId` (`podcastId` returns `400 InvalidParam: Parameter 'showId' is required`).
- Show ids were found once with `GET /v1/search?term=<name>&type=podcast` (`scripts/spotify-lookup.ts`, 10 requests). Matches for First Principles, Founders Unfiltered and SeedToScale were **different shows** with the same name, so those ids were cleared.
- **BASIC plan limit observed in headers: `X-RateLimit-Requests-Limit: 150` per month.** The pipeline budgets `SPOTIFY_MONTHLY_BUDGET=120`, spends ≤ 1 request per show per run (7 shows), and logs `rapidapi_requests` in `ingestion_jobs.provider_calls`. A 429/403 is logged and skipped — RSS and YouTube stay primary.
- Spotify audio is never downloaded; only metadata/descriptions are analysed.

## Indian startup news (Topics page)

| Publisher | Feed | Status |
|---|---|---|
| Inc42 | `https://inc42.com/feed/` | 200, 24 items |
| YourStory | `https://yourstory.com/feed` | 200, 20 items |
| Entrackr | `https://entrackr.com/rss` | 200 (`/feed` is 404; the site's `<link rel="alternate">` points to `/rss`) |

These feeds only carry the latest ~20 items, so news coverage builds up week by week from the first run.

## Gemini

`GET /v1beta/models` with the AI Studio key listed `gemini-3.6-flash`, `gemini-3.5-flash`, `gemini-3.7-flash` (+ lite variants). All three answered a JSON-mode test call. Default `GEMINI_MODEL=gemini-3.6-flash`; the others are fallbacks used only on quota (429) or overload (503). On 11 Oct 2026 the API returned 503 "high demand" for several minutes — the pipeline left those episodes pending and finished them on the next run.

## Spot-check of live output (Issue 1, 28 Sep – 04 Oct 2026)

Guests (each excerpt is verbatim from the linked source):
1. Scott Galloway — "Scott Galloway, Professor of Marketing at NYU's Stern School of Business" — YouTube description, youtube.com/watch?v=d6mAi5kHsxc ✔
2. David Bickford — "Former Legal Director of MI5 and MI6" — YouTube description ✔
3. Asish Mohapatra (OfBusiness) — episode title "…Spot Hidden Opportunities Asish Mohapatra | FO567" ✔
4. Manish Sabharwal (TeamLease) — Founder Thesis title "Manish Sabharwal(TeamLease)" ✔
5. Sasha Mirchandani (Kae Capital) — YouTube description ✔

Sponsor placements:
1. Urban Platter — "This episode is brought to you by Urban Platter." → **Confirmed** (5 Figuring Out episodes) ✔
2. Taptap Send — "…use promo code FIGURINGOUT on your first transfer…" → **Affiliate** ✔
3. Lifespan — "…get 50% off … with code RAJ2026" → was *probable*; a rule gap → added the `with code XYZ` affiliate rule + regression test; existing placements are re-classified from stored evidence on the next run ✔
4. Porter — "Download Porter Here: https://porter.in/enterprise" → **Probable — needs review** (no disclosure) ✔
5. Rezolve — "Checkout Rezolve Here: https://rezolve.com/" → **Probable** ✔

Audio-detected sponsor reads: produced only by the GitHub Actions run (ffmpeg); see `docs/TESTING.md` for the status of that check.
