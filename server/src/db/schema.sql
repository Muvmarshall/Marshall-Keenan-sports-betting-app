-- Parlay platform schema. Mirrors the data model in the build spec (section 4.1),
-- with one addition documented in README "Assumptions": team_stats.side
-- (offense|defense) so the Matchup tab can compare KC's offense against
-- DEN's defense as two distinct rows instead of one ambiguous team row.

CREATE TABLE IF NOT EXISTS games (
  id            SERIAL PRIMARY KEY,
  sport         TEXT NOT NULL,
  home_team     TEXT NOT NULL,
  away_team     TEXT NOT NULL,
  kickoff_utc   TIMESTAMPTZ NOT NULL,
  spread        NUMERIC,
  total         NUMERIC,
  status        TEXT NOT NULL DEFAULT 'scheduled' -- scheduled|live|final
);

CREATE TABLE IF NOT EXISTS teams (
  id      SERIAL PRIMARY KEY,
  name    TEXT NOT NULL,
  abbrev  TEXT NOT NULL UNIQUE,
  sport   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS team_stats (
  team_id                 INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  season                  INTEGER NOT NULL,
  split                   TEXT NOT NULL,   -- overall|rush|pass
  side                    TEXT NOT NULL,   -- offense|defense
  yards_per_play          NUMERIC,
  success_rate            NUMERIC,
  epa                     NUMERIC,
  sr_rank                 INTEGER,
  epa_rank                INTEGER,
  explosive_pct           NUMERIC,
  havoc_pct               NUMERIC,
  opponents_faced_rank    INTEGER,
  PRIMARY KEY (team_id, season, split, side)
);

CREATE TABLE IF NOT EXISTS players (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  position      TEXT NOT NULL, -- QB|RB|WR|TE|TEAM (TEAM = pseudo-player for team-total props)
  team_id       INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  headshot_url  TEXT
);

CREATE TABLE IF NOT EXISTS player_game_logs (
  id          SERIAL PRIMARY KEY,
  player_id   INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  game_id     INTEGER REFERENCES games(id) ON DELETE SET NULL,
  date        DATE NOT NULL,
  opponent    TEXT NOT NULL,
  pass_yds    NUMERIC DEFAULT 0,
  rush_yds    NUMERIC DEFAULT 0,
  rec_yds     NUMERIC DEFAULT 0,
  receptions  NUMERIC DEFAULT 0,
  targets     NUMERIC DEFAULT 0,
  tds         NUMERIC DEFAULT 0,
  snap_pct    NUMERIC
);

CREATE TABLE IF NOT EXISTS props (
  id          SERIAL PRIMARY KEY,
  game_id     INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id   INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  stat_type   TEXT NOT NULL, -- pass_yds|rush_yds|rec_yds|receptions|pass_tds|rush_tds|rec_tds|team_total
  line        NUMERIC NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS prop_odds (
  id              SERIAL PRIMARY KEY,
  prop_id         INTEGER NOT NULL REFERENCES props(id) ON DELETE CASCADE,
  book            TEXT NOT NULL,
  side            TEXT NOT NULL, -- over|under
  price_decimal   NUMERIC NOT NULL,
  multiplier      NUMERIC NOT NULL,
  observed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_open         BOOLEAN NOT NULL DEFAULT false,
  is_close        BOOLEAN NOT NULL DEFAULT false
);

-- Time-series index for movement queries: latest-first per prop, and open/close lookups.
CREATE INDEX IF NOT EXISTS idx_prop_odds_prop_time ON prop_odds (prop_id, observed_at);

CREATE TABLE IF NOT EXISTS slips (
  id                    SERIAL PRIMARY KEY,
  user_id               TEXT NOT NULL, -- anonymous client id (localStorage), no auth
  mode                  TEXT NOT NULL, -- edge|lottery
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  combined_multiplier   NUMERIC NOT NULL,
  est_probability       NUMERIC NOT NULL,
  est_ev                NUMERIC NOT NULL
);

CREATE TABLE IF NOT EXISTS slip_legs (
  id                  SERIAL PRIMARY KEY,
  slip_id             INTEGER NOT NULL REFERENCES slips(id) ON DELETE CASCADE,
  prop_id             INTEGER NOT NULL REFERENCES props(id) ON DELETE CASCADE,
  side                TEXT NOT NULL,
  multiplier_at_add   NUMERIC NOT NULL,
  edge_at_add         NUMERIC NOT NULL
);
