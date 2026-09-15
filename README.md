# Project Parlay

An NFL player-prop research and parlay-construction tool. The thesis: show the
honest expected value of every selection, and never promise a win.

## Stack

- **`packages/shared`** — TypeScript-only package with the EV math (no-vig
  probability, breakeven, edge, slip rollup) and the correlation-flag
  heuristics. Both the server and the web app import from here, so the math
  used to grade a prop and the math used to roll up a slip are the same code,
  not two reimplementations that can drift apart.
- **`server`** — Express + TypeScript API, PostgreSQL via `pg`. Odds access is
  behind an `OddsProvider` interface (`server/src/odds/`), with a mock
  implementation, a real implementation against The Odds API, and a stub for
  any other feed.
- **`web`** — React + TypeScript + Vite + Tailwind, mobile-first (390px),
  configured with the exact color/type/spacing tokens from the design brief.
  No accounts — the slip lives in `localStorage` under an anonymous client id.

## Setup

Requires Node 20+, PostgreSQL 14+ (or Docker), npm workspaces.

```bash
npm install

# 1. Point the server at a database
cp server/.env.example server/.env
# edit server/.env if your DATABASE_URL differs from the default

# 2. Create the schema and seed one NFL slate (real nflverse data by default —
#    needs network access; use STATS_SOURCE=mock for a fully offline seed)
npm run db:migrate
npm run seed

# 3. Run both apps (two terminals)
npm run dev:server   # http://localhost:4000
npm run dev:web      # http://localhost:5173 (proxies /api to :4000)

# 4. Run the reference-case tests
npm test
```

The seed script wipes and repopulates every table (`TRUNCATE ... RESTART
IDENTITY CASCADE`), so it's safe to re-run. It's deterministic (seeded RNG),
except for two showcase props (Rashee Rice receiving yards, Marvin Mims Jr.
receptions) whose final odds are pinned to match the reference design
mockup exactly, so the signature threshold card renders identically to the
brief on a fresh seed.

The server's 60-second poller is on by default (`ENABLE_POLLER=true` in
`.env`) and only writes a `prop_odds` row when a book's price actually
changes — polling every minute and writing every poll would fill the table
with duplicate rows. It deliberately does **not** fire an immediate poll on
boot, so the seed's opening/closing observations survive the first minute
after a restart. Set `ENABLE_POLLER=false` to freeze the market for a demo.

## Deploying to Vercel

The app deploys as a single Vercel project: `web/` builds to static assets,
and `api/[...all].ts` wraps the same Express app (`server/src/app.ts`) as one
serverless function, so both live on the same domain with no CORS setup.
`vercel.json` at the repo root already has the build command and the SPA
rewrite. What Vercel can't do for you:

1. **Provision Postgres.** In the Vercel dashboard, open the project's
   **Storage** tab → **Create Database** → Postgres (this is Neon under the
   hood). Vercel injects `DATABASE_URL` into the project's env vars
   automatically. Use the *pooled* connection string if you're offered a
   choice — a serverless function shouldn't hold a direct, unpooled
   connection open.
2. **Run migrate + seed against that database once**, from anywhere that can
   reach it (your machine, or hand me the connection string and I'll run
   it): `DATABASE_URL=<the pooled string> npm run db:migrate && DATABASE_URL=<...> npm run seed`.
3. **Deploy** — connect the GitHub repo in the Vercel dashboard (auto-deploys
   on push), or run `vercel --prod` with a token from
   vercel.com/account/tokens.

**The 60-second poller does not run on Vercel, on purpose.** It's a
`setInterval` in `index.ts`, which needs a persistent process — a
serverless function has none; each invocation is spun up, handles one
request, and can be frozen or recycled at any time. `api/[...all].ts`
imports `app.ts`, not `index.ts`, specifically so the poller's code path is
never reached there, rather than silently failing. Deployed this way, the
Movement tab shows exactly the seeded historical ticks and stops — which is
complete and honest for a **mock-data** demo, but is not "live" in the sense
of odds actually moving while someone has the page open. Getting real
60-second refresh on Vercel means replacing the `setInterval` with a Vercel
Cron Job hitting a `/api/poll` route on a schedule — a real change, not a
config flag, and out of scope until it's actually needed.

## The EV math

Every prop is graded against the multiplier the platform pays, not against a
proprietary projection:

```
p_over_raw  = 1 / decimal_odds_over
p_under_raw = 1 / decimal_odds_under
overround   = p_over_raw + p_under_raw
p_fair      = p_over_raw / overround        # no-vig consensus, weighted toward sharp books

breakeven   = 1 / multiplier                 # win rate the payout requires
edge        = p_fair − breakeven             # one market disagreeing with another
```

For a slip, legs are combined assuming independence (correlation is flagged,
never folded into the number):

```
combinedMultiplier = Π multiplier_i
estHitRate          = Π p_fair_i
breakevenNeeded      = 1 / combinedMultiplier
expectedValue         = estHitRate × combinedMultiplier − 1
```

All of this lives in `packages/shared/src/math.ts` and is unit-verifiable by
hand against any single prop — see the worked example in the build brief
(Rashee Rice, 55.5 receiving yards, 2.00x, 57.8% fair → +7.8% edge), which the
seed script reproduces exactly.

## Verification endpoint

`GET /api/verify/fair?over=-110&under=-110&multiplier=2.00` — public, permanent,
not a dev tool. Accepts American (`-110`, `+120`) or decimal (`1.9091`) odds,
auto-detected (`|price| >= 100` → American; anything else → decimal — decimal
odds for a two-way market are never that high, American odds are never that
low, by convention). Returns every intermediate value: the decimal conversion,
raw implied probability, overround, de-vigged fair probability, breakeven, and
edge — so a stranger can check the math by hand from the response alone. The
`/verify` page in the UI is the same calculator with the four reference cases
below pre-loaded as buttons, linked from the footer on every page.

These four cases are the ones that actually prove the vig is being removed,
not just averaged away — row 1 is the load-bearing one: a symmetric -110/-110
market is a coin flip, so a 2.00x multiplier must show exactly zero edge.
They're automated tests (`packages/shared/src/verify.test.ts`, run with
`npm test`), not just documentation:

| over | under | mult | fair (over) | edge |
|---|---|---|---|---|
| -110 | -110 | 2.00 | 0.5000 | +0.0000 |
| -130 | +110 | 2.00 | 0.5427 | +0.0427 |
| -200 | +165 | 2.00 | 0.6386 | +0.1386 |
| +120 | -140 | 1.80 | 0.4380 | −0.1176 |

## Closing-line value and the grading pipeline

Every poll, for every prop where `|edge| >= 1%`, a snapshot is written to
`edge_log` — deliberately not deduplicated to one row per prop. A prop that
stays flagged for six hours of 60-second polling produces ~360 rows, each an
independent observation graded against its own closing line; that's what
makes closing-line value (CLV) a distribution instead of a single number.

Once a prop's game passes kickoff and a closing (`is_close`) odds observation
exists, `edge_close` is written: the fair probability at close, whether the
line moved toward the flagged side, and `clv_points` (signed toward that
side). Once the real outcome is known, `edge_result` is written: the actual
stat value and whether it hit. **CLV is the headline metric, not hit rate** —
a single slate is noise; line movement agreeing with a flag is signal within
days. The public `/results` page (linked from the footer) reads only these
three tables, breaks results down by stat type, edge size, and week, and
flags every figure under 100 flags as low-sample rather than hiding it —
including losing weeks, which are shown, not filtered out.

Settlement (`server/src/lib/settlement.ts`) is pluggable
(`ActualStatResolver`). The default, `MockSettlementResolver`, is used only
when there's no real game to observe: it draws a plausible outcome from the
player's own recent average and tags every row it writes
`source='mock-settlement'` — never presented as a real result. A `nflverse`-
backed resolver (real box scores once published) is a natural follow-up,
sharing the same weekly data this build already fetches for game logs — not
wired in yet.

A daily digest (`server/src/lib/dailyDigest.ts`) computes yesterday's totals
(flagged, closed, settled, avg CLV, hit rate) and "sends" it once a day near
09:00 ET. No email provider is configured in this build — delivery goes
through a `DigestSender` interface, and the default `ConsoleDigestSender`
logs the digest as structured output instead of silently doing nothing. Wire
in a real provider (Resend, SES, SendGrid) by implementing that same
interface.

## Stale data handling

Every prop's edge carries an `observedAt` timestamp — the *oldest*
observation among every book (and the platform) that fed into that number,
not the newest, so one stale contributing book can't hide behind fresher
ones. The threshold card degrades in three steps as that age grows:

- **Under 5 minutes**: timestamp shown in the normal ink-faint color.
- **5–15 minutes**: timestamp switches to `--caution`.
- **Over 15 minutes**: the card desaturates, the edge/multiplier/fair-estimate
  row is replaced with "Price is stale — last seen HH:MM", and "Add to slip"
  disables. This happens from real data aging, not just a forced test — see
  the screenshot in this project's history where one card on a live-seeded
  page genuinely hit this state because that particular book/side hadn't
  changed in the recent polls.

Separately, `FeedStatusContext` polls `/api/health` every 30s and shows a
persistent banner — **no edge values render anywhere** — only on an explicit
failure signal (the health endpoint itself unreachable, or the poller's last
run erroring), never from a hardcoded staleness clock. A live deployment on a
free odds-API key might legitimately poll every 6 hours; that's not "the feed
is down," and the banner logic knows the difference because `/api/health`
reports the deployment's actual configured poll interval.

## Data provenance

Team and player statistics come from
[nflverse](https://github.com/nflverse/nflverse-data) (CC-BY 4.0, open data) —
`server/src/lib/nflverse.ts` fetches two release files (team-season and
player-week box scores), caches them to `server/data/cache/` after first
fetch, and every downstream value traces back to one of those two files. No
site is scraped.

Controlled by `STATS_SOURCE`, defaulting to `nflverse` (`npm run seed`) —
Phase 2 states real provenance as the requirement, not an opt-in, so a plain
seed uses it. Set `STATS_SOURCE=mock` explicitly for offline dev or a
network-restricted CI run; that path is unchanged from Phase 1, including the
mockup-exact showcase numbers.

What's real in `nflverse` mode:

- **Rosters** — each team's actual top players by real 2025 season production
  (most passing/rushing/receiving yards at each position), not invented names.
- **Player game logs** — real weekly box scores for those players. (The
  calendar date on each row is synthesized from season+week, since nflverse's
  weekly file has no literal date column — only the date is approximated; the
  stat values themselves are exactly what nflverse published.)
- **Team offense** — yards/play and EPA/play straight from the team-season
  file.
- **Team defense** — yards/play and EPA/play *derived* by aggregating every
  opponent's real production in games against that team (nflverse doesn't
  publish a separate "allowed" file, but the weekly file's `opponent_team`
  column makes this a straightforward aggregation, not an estimate).

What's NOT available without full play-by-play data (a much larger fetch this
build doesn't do) — **omitted and labeled, never faked**, per spec: "If any
required stat is unavailable from a licensed source, omit the stat and note
it. Do not approximate it and present it as measured":

- `success_rate`, `explosive_pct`, `havoc_pct` — these are per-play
  classifications with no season/week-summary equivalent.
- `opponents_faced_rank` (strength of schedule) — same reason.

The UI shows "not available" for these rather than a zero or a guess (see
`MatchupTab.tsx`'s `pctOrNA` and `RankBadge`'s null handling) — this took a
real bug fix to get right: `Number(null)` and `null * 100` both evaluate to
`0` in JavaScript, which had been silently turning "we don't know" into a
fake "0.0%" before the fix. The Matchup tab's insight engine also skips its
strength-of-schedule rule entirely when the inputs are null (`null <= 10` is
`true` in JS — another place a naive comparison would have fired an insight
on missing data) and falls back to an EPA-differential rule that works with
real data's one guaranteed per-play metric.

`team_total` props (used for one correlation-flag pattern) have no nflverse
equivalent either — see the assumptions list.

## Age gate and legal pages

A blocking, full-screen confirmation on first visit (`AgeGate.tsx`) states
plainly that this is a research tool, not a sportsbook, and requires 21+
before the rest of the app is reachable. The acknowledgment is stored in
`localStorage` only — no server round trip, no account. `/terms` and
`/privacy` are real routes with real structure (section headings that mirror
what a real policy would cover) but every section body is an explicit
`DRAFT — PENDING LEGAL REVIEW` placeholder — per spec, "do not write legal
language," so none was written.

## Operations

- `/api/health` reports database connectivity, the poller's last run (time,
  ok/error, props seen, rows written) and its configured interval, and row
  counts for `edge_log`/`edge_close`/`edge_result`.
- Every poll writes one structured JSON log line (`poll_complete`: props seen,
  rows written, flags checked, closes/settlements written, errors) — grep or
  pipe to a log aggregator as-is.
- The daily digest (above) is the other scheduled job; both run only from
  `index.ts` (a persistent process), never from the Vercel serverless path.
- Slip contents are never sent anywhere but this app's own Postgres — there is
  no third-party analytics integration anywhere in this codebase (verified by
  reading every `fetch`/HTTP call site, not just asserted) for that
  requirement to violate.

## Live odds feed

`server/src/odds/theOddsApiProvider.ts` is a real implementation against
[The Odds API](https://the-odds-api.com) v4, gated behind `ODDS_PROVIDER=live`
+ `ODDS_API_KEY` in `server/.env`. **I wrote this without being able to test
it** — this sandbox's network egress policy blocks `the-odds-api.com` (and
`sportsdata.io`), so I could not fetch their docs or a real response before
writing the field mappings. It's implemented from documented knowledge of a
stable, widely-used API, not verified live. Before trusting it:

```bash
curl "https://api.the-odds-api.com/v4/sports/americanfootball_nfl/events/EVENT_ID/odds\
?apiKey=YOUR_KEY&regions=us&markets=player_pass_yds&oddsFormat=decimal"
```

and compare the shape to `EventOddsResponse` in that file. The market-key
strings in `STAT_TYPE_TO_MARKET` (e.g. `player_pass_yds`) are the most likely
point of drift — they're a guess at the API's naming, not a confirmed value.
If a player's props don't show up, check `matchesPlayer()`'s name comparison
next — "Marvin Mims Jr." in our seed data vs. however the feed spells it is a
real risk. Each prop's poll failure is caught and logged individually
(`poller.ts`), so one mismatch won't take down the rest.

**What "platform multiplier" means changes in live mode.** The mock's
platform multiplier represents this product's own payout, deliberately
lagging the true market — that's what makes its edge a genuine "one market
disagreeing with another" signal (see the EV math section above). There's no
real feed for that: sportsbook odds APIs don't publish a DFS platform's
payout table. So `theOddsApiProvider.ts` reinterprets it: one representative
retail book (DraftKings, if posted) stands in for "platform," and the fair
probability is the consensus of every *other* book. The edge this produces is
real — it's a line-shopping signal, is this book mispriced relative to the
rest of the market — but it is not the same claim the mock's edge makes, and
the UI doesn't currently say which mode produced a given number. That's a
follow-up, not something to gloss over.

**Request budget.** Player props are a per-event endpoint
(`/events/{id}/odds`), not the bulk odds endpoint, and each market you
request costs against a free-tier monthly quota (historically ~500
requests/month). The provider caches each event's odds for 90 seconds so
every prop in the same game shares one fetch within a poll cycle, but that
does not save you across cycles — polling every 60 seconds will exhaust a
free key in hours, not weeks. Set `POLL_INTERVAL_MS` to something like
`21600000` (6 hours) on a free key; this is exactly the "free tier: slow
refresh, not real movement tracking" tier, not the 60-second tier.

To wire up a different provider instead, `server/src/odds/liveProviderStub.ts`
shows the interface shape (`tick(ctx) => Promise<OddsTick>`) with no
implementation. Nothing outside `server/src/odds/` depends on which
implementation is active — routes, the poller, and the seed script only see
the `OddsProvider` interface.

## Assumptions and simplifications

1. **`team_stats.side` column.** The brief's schema has one `team_stats` row
   per team/season/split; the Matchup tab needs a team's *offense* and
   *defense* profile as two distinct rows (KC's offense against DEN's
   defense), so a `side` (`offense`/`defense`) column was added to the
   primary key.
2. **Line changes create a new `props` row.** `props.line` is fixed per row
   in the given schema, so a genuine line move (58.5 → 55.5) is modeled as a
   new `props` row for the same player/stat/game, not a mutation. The
   Movement tab stitches every `props` row for a market together by
   `created_at` to build the open-vs-current line history.
3. **`prop_odds.book` carries two different things.** Rows from real
   sportsbooks (Pinnacle, Circa, DraftKings, FanDuel, Caesars) feed the
   no-vig consensus. A row with `book = 'Parlay Platform'` is this product's
   own posted multiplier, tracked the same way so its movement over time can
   be charted — and deliberately *excluded* from the consensus calculation,
   since the product's thesis is comparing the platform's number against the
   market's, not averaging them together.
4. **One primary side per prop card.** The mockup's threshold card shows a
   single edge figure with no explicit over/under toggle. The API computes
   edge for both sides and exposes whichever carries the larger edge as
   `primary`; that's what the card and "add to slip" use.
5. **Two independent slips, not one.** "Edge" and "Lottery" are modeled as
   two separate leg lists (each persisted separately in `localStorage`),
   rather than one list with a display filter — switching modes changes what
   you're building, not just what you're viewing, which is what lets Edge
   mode flatly refuse a negative-EV add instead of silently hiding it.
6. **"Swap the weak legs" removes, it doesn't replace.** The button drops the
   legs dragging the slip's EV down. It does not auto-suggest replacements —
   picking a specific new leg on the user's behalf would be a step toward
   "trust us," which runs against the product's own honesty standard.
7. **Ranks are within the seeded 12-team sample**, not all 32 NFL teams
   (there's no full-league dataset here). The top/bottom tier coloring
   scales proportionally (≈31% top, ≈31% bottom, matching the spec's 10-of-32
   ratio) rather than hard-coding "top ten."
8. **Slip persistence exists but isn't graded.** `POST /api/slips` stores a
   snapshot (mode, legs, computed EV) under an anonymous client id so the two
   modes' results *could* be tracked over time, per section 3.7. Grading
   those slips against final game outcomes is out of scope for v1 — there's
   no live scoring pipeline — so `slips`/`slip_legs` capture the data without
   a results dashboard on top of it.
9. **Seed data uses real, recognizable NFL player names** (for realism, the
   same way public sports statistics products do) with entirely synthetic
   game logs and odds — none of it is live or historical data.
10. **Correlation detection is a fixed set of three heuristics** (same-team
    QB passing + that team's receiver yards; a player's rushing over + that
    team's total under; two same-team receivers both over), exactly per the
    brief's "flag only, never score" instruction. A `team_total` stat type
    and a `TEAM` pseudo-position were added to the schema so the
    rushing-vs-team-total pattern has real data to detect against.
11. **One full slate, scaled down.** The seed generates 6 games / 12 teams
    (5 games "today," 1 "tomorrow" with lines not yet posted, matching the
    mockup's empty state) rather than a full 16-game week, to keep seed time
    reasonable. The pipeline (schema, odds simulation, insight rules) is
    identical at any slate size — extending `TEAMS`/`gameDefs` in
    `server/src/scripts/seed.ts` is the only change needed for a full week.
12. **`team_total` has no live equivalent.** It exists in the mock/schema for
    the rushing-vs-team-total correlation flag (section 3.7 of the brief),
    but The Odds API's player-prop markets don't include a team-total
    market — `theOddsApiProvider.ts` has no mapping for it and will throw if
    asked to fetch one. Live mode simply won't produce that correlation flag
    until a real team-totals source is wired in separately.

### Phase 2

13. **`edge_log` logs every qualifying poll, not one row per prop.** Read
    literally from spec section 2 ("On every poll... write a snapshot"), not
    deduplicated. This means a prop that stays flagged for hours produces many
    correlated observations rather than one — a deliberate reading, not an
    oversight, and the one that makes a CLV *distribution* possible. Flagged
    explicitly in case a single-row-per-prop design was actually intended.
14. **Verification endpoint's edge is always for the "over" side.** Unlike the
    rest of the app (which reports whichever side has the larger edge), the
    four reference cases are defined against "over" specifically, so
    `verifyFair` matches them exactly rather than picking a "primary" side.
15. **Mock settlement, not real settlement, by default.** There is no live
    score feed in this build. `MockSettlementResolver` draws a plausible
    outcome from the player's own recent average rather than inventing one
    from nothing, and tags every row `source='mock-settlement'` so it's never
    confused with a real result. A `nflverse`-backed real resolver is a
    natural follow-up (the weekly data it would need is already fetched for
    game logs) but isn't wired in.
16. **Daily digest logs instead of emailing.** No email provider credentials
    exist in this build. `DigestSender` is pluggable; the default
    `ConsoleDigestSender` writes structured output so the digest is never
    silently dropped, but nothing is actually emailed until a real provider
    is configured.
17. **`STATS_SOURCE` defaults to `nflverse`, not `mock`.** Phase 2 states real
    provenance as the requirement, not an opt-in enhancement — so the default
    seed behavior changed, not just an available flag. `STATS_SOURCE=mock`
    is the explicit, documented escape hatch for offline work.
18. **Real rosters are today's actual top producers, not a fixed list.** In
    `nflverse` mode, each team's roster is computed (top passer/rushers/
    receivers by real season yardage), not hardcoded — so it reflects
    whichever season's data is fetched, not a snapshot frozen at build time.
19. **Game log dates are approximated; the stats themselves are not.**
    nflverse's weekly file has no calendar-date column, only season+week, so
    `player_game_logs.date` is synthesized (a fixed per-season anchor + 7
    days/week) purely to preserve chronological ordering. Every stat value on
    that row is the real, unmodified nflverse figure.
20. **`success_rate`/`explosive_pct`/`havoc_pct`/`opponents_faced_rank` are
    `NULL` in `nflverse` mode**, not zero or estimated — they need full
    play-by-play data this build doesn't fetch. The Matchup tab shows "not
    available" for them explicitly, and the insight engine's
    strength-of-schedule rule is skipped (not fired on a null-coerced-to-0
    comparison) when they're missing, falling back to an EPA-differential
    insight that works with real data's one guaranteed per-play metric.

## What's deliberately not built (v1 scope, per the brief)

Accounts/auth, payments, bet placement or sportsbook deep links, a
proprietary projection model, social features, push notifications, and any
sport beyond NFL (the sport tabs for NCAAF/NBA/MLB render and respond
honestly that they're not live yet, rather than silently failing).
