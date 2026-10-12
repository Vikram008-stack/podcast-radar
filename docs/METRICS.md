# Metrics & ranking

All metrics are deterministic functions in [`lib/metrics.ts`](../lib/metrics.ts), unit-tested in `tests/unit/metrics.test.ts`. AI never produces a number.

## Windows (Asia/Kolkata, no DST)

- **Reporting week** = previous **Monday 00:00 IST → Sunday 23:59:59.999 IST**, computed in [`lib/time.ts`](../lib/time.ts) (`reportingPeriod(now)`).
- **30-day window** ends at the same Sunday (`start30 = end − 30 days`).
- **Previous week** (for topic change) = the 7 days before the reporting week.
- Timestamps are stored in UTC and displayed as `DD MMM YYYY, HH:mm IST`.
- Edge cases tested: Sunday 23:59 IST, Monday 00:00 IST, Monday 00:30 IST when UTC is still Sunday.

## Unit of counting

One **merged episode** per release: RSS, YouTube and Spotify copies are merged when the normalised titles match (Jaccard ≥ 0.6 or containment) and publish dates are within 3 days. A YouTube video counts as an episode only if it is ≥ `MIN_EPISODE_MINUTES` (default 20, per show in Settings) — Shorts/clips are excluded.

## Guests — last 30 days

| Field | Definition |
|---|---|
| distinct shows | number of different monitored shows with an evidenced appearance |
| appearances | number of merged episodes with an evidenced appearance |
| first / latest | earliest / latest episode date |

**Rank:** distinct shows ↓ → appearances ↓ → latest appearance ↓ → name (A→Z).
**Featured:** ≥ 1 distinct show (changed from ≥ 2 at Aditya’s request, 12 Oct 2026), top 3 by the ranking above — so multi-show guests still come first. Fewer qualify → honest empty slots.
Hosts configured per show are never guests. Name variants merge via `guest_aliases`; same/similar names with **conflicting companies** are kept as separate guests (never merged on name alone).

## Topics — reporting week

| Field | Definition |
|---|---|
| episodes | merged episodes in the week tagged with the topic |
| distinct shows | shows among those episodes |
| previous | episodes in the previous week |
| change | `(current − previous) / previous`; **"New"** when previous = 0 |

**Rank:** distinct shows ↓ → episodes ↓ → change ↓ ("New" ranks above any finite change) → name.
**Featured:** ≥ 2 distinct shows. Audience response shows public YouTube views/likes with the collection timestamp, or "Insufficient public data".

## Sponsors — last 30 days

Placements are **one per brand per episode** (strongest classification across all evidence lines).

| Class | Rule (see `lib/sponsors.ts`) |
|---|---|
| Confirmed | explicit disclosure tied to the brand in the stored evidence: sponsored by, brought to you by, presented by, powered by, in association with, in partnership with, #ad, paid partnership, today's/our sponsor, Hinglish/Hindi equivalents (*sponsor kiya*, *ke sponsor*, *ke saath partnership*, *द्वारा प्रायोजित*) |
| Affiliate / referral | promo/coupon code, "with code XYZ", referral/affiliate link, tracked short link — without a disclosure |
| Promotion ("Recurring promotion" when ≥ 2 episodes) | promotional copy for the brand flagged by Gemini, no disclosure phrase |
| Related-party | brand is a configured house brand of the show — excluded from rankings |
| Organic | mentioned as topic / guest's company — not stored as a placement |

Gemini may *suggest* a class; **Confirmed requires the rule-matched text in stored evidence** (the stored ≤25-word window is centred on the matched phrase). Rules are re-applied to all stored evidence on every run, so rule changes and house-brand edits take effect without new AI calls.

**Rank (confirmed only):** distinct shows ↓ → confirmed placements ↓ → latest placement ↓ → name. Affiliate/probable brands are listed separately. No ad-spend estimates anywhere.

## Opportunity This Week

Deterministic selection: the **top featured topic**, plus the **top featured guest** whose evidenced episodes carry that topic (if any). Gemini only writes the 2-sentence copy from that payload; it is labelled *AI interpretation* and every sentence must cite payload ids (`ep:…`, `news:…`) or it is dropped.

## Report lifecycle

`building` → `ready`. A report is marked ready only when every episode in the window has been analysed; otherwise it stays *in progress* (shown with a badge) and the next run completes it. A ready report is a **frozen snapshot**: later runs never rewrite it (manual re-scans only refresh data for next week).

## Featured slots (Aditya’s rule, 12 Oct 2026)
Home and the archive always fill **the top 3** of each ranked list — guests, topics, and brands (confirmed sponsors first, then recurring promotions, affiliate codes and one-off promotions) — with no minimum show count. A slot is empty only when fewer than 3 items exist. The Opportunity banner always uses the top-ranked topic. Disclosure phrases now also include *delivered by*, *supported by* and *in collaboration with*. On-screen video overlays (e.g. a "Delivered by Porter" bug) are not read — the app uses text and audio only — so repeated promotions are surfaced as **Recurring promotion · N episodes**.

## Content guardrail (Aditya, 12 Oct 2026)
The radar covers **independent Indian startups and their founders** only (`lib/scope.ts`).
- Gemini labels every guest `startup_founder | startup_investor | operator_or_expert | other` and whether they have an **India startup link**; only Indian-startup founders and investors are stored. Athletes, actors, academics, foreign executives and the like are dropped, even on a monitored business show.
- Every episode gets `in_scope`; topics are counted only from in-scope episodes (celebrity, sports, health, spy, self-help episodes create no topics).
- Sponsors are unaffected: a brand paying to reach these audiences counts on any episode.
