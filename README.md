# Parlay platform

An NFL player-prop research and parlay-construction tool. The thesis: show the
honest expected value of every selection, and never promise a win.

## Stack

- **`packages/shared`** — TypeScript-only package with the EV math (no-vig
  probability, breakeven, edge, slip rollup) and the correlation-flag
  heuristics. Both the server and the web app import from here, so the math
  used to grade a prop and the math used to roll up a slip are the same code,
  not two reimplementations that can drift apart.
- **`server`** — Express + TypeScript API, PostgreSQL via `pg`. Odds access is
  behind an `OddsProvider` interface (`server/src/odds/`) with a mock
  implementation and a live-feed stub.
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

# 2. Create the schema and seed one NFL slate
npm run db:migrate
npm run seed

# 3. Run both apps (two terminals)
npm run dev:server   # http://localhost:4000
npm run dev:web      # http://localhost:5173 (proxies /api to :4000)
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

## Swapping in a live odds feed

`server/src/odds/liveProviderStub.ts` implements the same `OddsProvider`
interface as the mock (`tick(ctx) => OddsTick`). Wire a real feed (The Odds
API, SportsDataIO, etc.) into its `tick()` method, mapping the response into
`{ bookQuotes: BookQuote[], platformMultiplier: Record<Side, number> }`, and
set `ODDS_PROVIDER=live` in `server/.env`. Nothing else changes — the routes,
the poller, and the seed script all depend on the interface, not on which
implementation is active.

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

## What's deliberately not built (v1 scope, per the brief)

Accounts/auth, payments, bet placement or sportsbook deep links, a
proprietary projection model, social features, push notifications, and any
sport beyond NFL (the sport tabs for NCAAF/NBA/MLB render and respond
honestly that they're not live yet, rather than silently failing).
