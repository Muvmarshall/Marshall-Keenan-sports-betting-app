import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, '../../data/cache');
const BASE_URL = 'https://github.com/nflverse/nflverse-data/releases/download';

/**
 * Open data, permissive license (CC-BY 4.0) — see https://github.com/nflverse/nflverse-data.
 * This is the licensed source Phase 2 requires for team/player statistics; scraping
 * nfl.com/ESPN/PFF is explicitly out per that spec. Every value this module returns
 * traces back to one of these two release files, cached to disk after first fetch so
 * re-seeding doesn't re-download ~9MB every time.
 */
async function fetchCsv<T>(url: string, cacheFile: string): Promise<T[]> {
  const cachePath = join(CACHE_DIR, cacheFile);
  let text: string;

  if (existsSync(cachePath)) {
    text = readFileSync(cachePath, 'utf-8');
  } else {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`nflverse fetch failed (${res.status}): ${url}`);
    }
    text = await res.text();
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(cachePath, text, 'utf-8');
  }

  return parse(text, { columns: true, skip_empty_lines: true }) as T[];
}

export interface PlayerWeekRow {
  player_display_name: string;
  position: string;
  season: string;
  week: string;
  season_type: string;
  team: string;
  opponent_team: string;
  completions: string;
  attempts: string;
  passing_yards: string;
  passing_tds: string;
  passing_epa: string;
  carries: string;
  rushing_yards: string;
  rushing_tds: string;
  rushing_epa: string;
  receptions: string;
  targets: string;
  receiving_yards: string;
  receiving_tds: string;
  receiving_epa: string;
}

export interface TeamSeasonRow {
  team: string;
  season_type: string;
  games: string;
  attempts: string;
  passing_yards: string;
  passing_tds: string;
  passing_epa: string;
  carries: string;
  rushing_yards: string;
  rushing_tds: string;
  rushing_epa: string;
}

export interface PlayerSeasonRow {
  player_display_name: string;
  position: string;
  season_type: string;
  recent_team: string;
  games: string;
  attempts: string;
  passing_yards: string;
  carries: string;
  rushing_yards: string;
  receptions: string;
  targets: string;
  receiving_yards: string;
}

const playerSeasonCache = new Map<number, Promise<PlayerSeasonRow[]>>();
export function loadPlayerSeasonRows(season: number): Promise<PlayerSeasonRow[]> {
  let p = playerSeasonCache.get(season);
  if (!p) {
    p = fetchCsv<PlayerSeasonRow>(
      `${BASE_URL}/stats_player/stats_player_reg_${season}.csv`,
      `stats_player_reg_${season}.csv`,
    );
    playerSeasonCache.set(season, p);
  }
  return p;
}

const playerWeekCache = new Map<number, Promise<PlayerWeekRow[]>>();
export function loadPlayerWeekRows(season: number): Promise<PlayerWeekRow[]> {
  let p = playerWeekCache.get(season);
  if (!p) {
    p = fetchCsv<PlayerWeekRow>(
      `${BASE_URL}/stats_player/stats_player_week_${season}.csv`,
      `stats_player_week_${season}.csv`,
    );
    playerWeekCache.set(season, p);
  }
  return p;
}

const teamSeasonCache = new Map<number, Promise<TeamSeasonRow[]>>();
export function loadTeamSeasonRows(season: number): Promise<TeamSeasonRow[]> {
  let p = teamSeasonCache.get(season);
  if (!p) {
    p = fetchCsv<TeamSeasonRow>(
      `${BASE_URL}/stats_team/stats_team_reg_${season}.csv`,
      `stats_team_reg_${season}.csv`,
    );
    teamSeasonCache.set(season, p);
  }
  return p;
}

export interface DerivedTeamSplit {
  yardsPerPlay: number;
  epaPerPlay: number;
  plays: number;
}

/** A team's own offensive output for one split, straight from the season file. */
export function teamOffenseSplit(row: TeamSeasonRow, split: 'overall' | 'rush' | 'pass'): DerivedTeamSplit | null {
  const attempts = Number(row.attempts);
  const carries = Number(row.carries);
  const passYds = Number(row.passing_yards);
  const rushYds = Number(row.rushing_yards);
  const passEpa = Number(row.passing_epa);
  const rushEpa = Number(row.rushing_epa);

  if (split === 'pass') {
    if (attempts === 0) return null;
    return { yardsPerPlay: passYds / attempts, epaPerPlay: passEpa / attempts, plays: attempts };
  }
  if (split === 'rush') {
    if (carries === 0) return null;
    return { yardsPerPlay: rushYds / carries, epaPerPlay: rushEpa / carries, plays: carries };
  }
  const plays = attempts + carries;
  if (plays === 0) return null;
  return { yardsPerPlay: (passYds + rushYds) / plays, epaPerPlay: (passEpa + rushEpa) / plays, plays };
}

/**
 * A team's defensive output for one split, derived by summing every OTHER team's
 * offensive production in games played against this team — nflverse doesn't publish
 * a separate "defense allowed" file, but the weekly player rows carry `opponent_team`,
 * so "what team X's defense allowed" is just "what everyone scored when opponent_team
 * was X," aggregated. This is a derived computation, not a raw measured field —
 * labeled as such in the API response.
 */
export function teamDefenseSplitFromWeeklyRows(
  weeklyRows: PlayerWeekRow[],
  teamAbbrev: string,
  split: 'overall' | 'rush' | 'pass',
): DerivedTeamSplit | null {
  const facedTeam = weeklyRows.filter((r) => r.opponent_team === teamAbbrev && r.season_type === 'REG');
  if (facedTeam.length === 0) return null;

  let yards = 0;
  let epa = 0;
  let plays = 0;

  for (const r of facedTeam) {
    if (split === 'pass' || split === 'overall') {
      yards += Number(r.passing_yards) || 0;
      epa += Number(r.passing_epa) || 0;
      plays += Number(r.attempts) || 0;
    }
    if (split === 'rush' || split === 'overall') {
      yards += Number(r.rushing_yards) || 0;
      epa += Number(r.rushing_epa) || 0;
      plays += Number(r.carries) || 0;
    }
  }

  if (plays === 0) return null;
  return { yardsPerPlay: yards / plays, epaPerPlay: epa / plays, plays };
}

export interface RosterPick {
  name: string;
  position: 'QB' | 'RB' | 'WR' | 'TE';
}

const ROSTER_SHAPE: { position: 'QB' | 'RB' | 'WR' | 'TE'; count: number; rankBy: (r: PlayerSeasonRow) => number }[] = [
  { position: 'QB', count: 1, rankBy: (r) => Number(r.passing_yards) || 0 },
  { position: 'RB', count: 2, rankBy: (r) => Number(r.rushing_yards) || 0 },
  { position: 'WR', count: 3, rankBy: (r) => Number(r.receiving_yards) || 0 },
  { position: 'TE', count: 1, rankBy: (r) => Number(r.receiving_yards) || 0 },
];

/** This team's real top players by season production, one real roster per position group. */
export function realRosterForTeam(seasonRows: PlayerSeasonRow[], teamAbbrev: string): RosterPick[] {
  const teamRows = seasonRows.filter((r) => r.recent_team === teamAbbrev && r.season_type === 'REG');
  const picks: RosterPick[] = [];
  for (const shape of ROSTER_SHAPE) {
    const candidates = teamRows
      .filter((r) => r.position === shape.position)
      .sort((a, b) => shape.rankBy(b) - shape.rankBy(a))
      .slice(0, shape.count);
    for (const c of candidates) picks.push({ name: c.player_display_name, position: shape.position });
  }
  return picks;
}
