import 'dotenv/config';
import { pool } from '../db/pool.js';
import { MockOddsProvider } from '../odds/mockProvider.js';
import { PLATFORM_BOOK, SPORTSBOOKS } from '../odds/types.js';
import {
  loadPlayerSeasonRows,
  loadPlayerWeekRows,
  loadTeamSeasonRows,
  realRosterForTeam,
  teamDefenseSplitFromWeeklyRows,
  teamOffenseSplit,
  type PlayerWeekRow,
  type TeamSeasonRow,
} from '../lib/nflverse.js';
import type { Side } from '@parlay/shared';

const SEASON = 2025;

// 'nflverse' sources real rosters, real weekly game logs, and real team offense/
// defense splits (derived) from nflverse's open data — see README "Data
// provenance." success_rate/explosive_pct/havoc_pct/opponents_faced_rank have no
// real source without full play-by-play, so they're left NULL rather than faked;
// the UI shows "not available" for them in this mode.
//
// Defaults to 'nflverse': Phase 2 states real provenance as the requirement, not
// an opt-in enhancement, so a plain `npm run seed` should use it. Set
// STATS_SOURCE=mock explicitly for offline dev or CI without network access —
// that path still reproduces the mockup-exact showcase numbers unchanged.
const STATS_SOURCE = process.env.STATS_SOURCE === 'mock' ? 'mock' : 'nflverse';

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20250914);
const rand = (lo: number, hi: number) => lo + rng() * (hi - lo);
const pick = <T,>(arr: T[]) => arr[Math.floor(rng() * arr.length)];

async function bulkInsert(table: string, columns: string[], rows: unknown[][]) {
  if (rows.length === 0) return;
  const BATCH = 1000;
  for (let start = 0; start < rows.length; start += BATCH) {
    const batch = rows.slice(start, start + BATCH);
    const values: unknown[] = [];
    const chunks: string[] = [];
    let i = 1;
    for (const row of batch) {
      chunks.push(`(${row.map(() => `$${i++}`).join(',')})`);
      values.push(...row);
    }
    await pool.query(`INSERT INTO ${table} (${columns.join(',')}) VALUES ${chunks.join(',')}`, values);
  }
}

const TEAMS = [
  { abbrev: 'KC', name: 'Kansas City Chiefs' },
  { abbrev: 'DEN', name: 'Denver Broncos' },
  { abbrev: 'SEA', name: 'Seattle Seahawks' },
  { abbrev: 'ARI', name: 'Arizona Cardinals' },
  { abbrev: 'BUF', name: 'Buffalo Bills' },
  { abbrev: 'MIA', name: 'Miami Dolphins' },
  { abbrev: 'DAL', name: 'Dallas Cowboys' },
  { abbrev: 'PHI', name: 'Philadelphia Eagles' },
  { abbrev: 'SF', name: 'San Francisco 49ers' },
  { abbrev: 'GB', name: 'Green Bay Packers' },
  { abbrev: 'BAL', name: 'Baltimore Ravens' },
  { abbrev: 'CIN', name: 'Cincinnati Bengals' },
];

const FIRST_NAMES = ['James', 'Michael', 'Chris', 'Jordan', 'Tyler', 'Devin', 'Marcus', 'Jalen', 'Trevon', 'Isaiah', 'Deshawn', 'Cole'];
const LAST_NAMES = ['Carter', 'Thompson', 'Reed', 'Coleman', 'Harris', 'Bryant', 'Foster', 'Sullivan', 'Ellis', 'Marshall', 'Grant', 'Price'];
function randomName(used: Set<string>): string {
  let name = '';
  do {
    name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
  } while (used.has(name));
  used.add(name);
  return name;
}

interface RosterSpot {
  position: 'QB' | 'RB' | 'WR' | 'TE';
  name?: string;
}

// Showcase rosters carry real, recognizable names for the two headline games so the
// seeded data lines up with the reference design mockup. Every stat value is still
// synthetic/random, not a live feed — see README "Assumptions".
const SHOWCASE_ROSTERS: Record<string, RosterSpot[]> = {
  KC: [{ position: 'QB' }, { position: 'RB' }, { position: 'RB' }, { position: 'WR', name: 'Rashee Rice' }, { position: 'WR' }, { position: 'WR' }, { position: 'TE' }],
  DEN: [{ position: 'QB', name: 'Bo Nix' }, { position: 'RB' }, { position: 'RB' }, { position: 'WR', name: 'Marvin Mims Jr.' }, { position: 'WR' }, { position: 'WR' }, { position: 'TE' }],
  SEA: [{ position: 'QB' }, { position: 'RB', name: 'Kenneth Walker III' }, { position: 'RB' }, { position: 'WR' }, { position: 'WR' }, { position: 'WR' }, { position: 'TE' }],
};
const DEFAULT_ROSTER: RosterSpot[] = [
  { position: 'QB' }, { position: 'RB' }, { position: 'RB' }, { position: 'WR' }, { position: 'WR' }, { position: 'WR' }, { position: 'TE' },
];

const STAT_TYPES_BY_POSITION: Record<string, string[]> = {
  QB: ['pass_yds'],
  RB: ['rush_yds'],
  WR: ['rec_yds', 'receptions'],
  TE: ['rec_yds'],
};

function statBaseline(position: string, statType: string): { mean: number; sd: number } {
  if (statType === 'pass_yds') return { mean: 245, sd: 55 };
  if (statType === 'rush_yds') return { mean: position === 'RB' ? 72 : 20, sd: 28 };
  if (statType === 'rec_yds') return { mean: position === 'WR' ? 58 : 38, sd: 30 };
  if (statType === 'receptions') return { mean: position === 'WR' ? 4.2 : 3, sd: 2.1 };
  return { mean: 50, sd: 20 };
}

function gaussian(mean: number, sd: number): number {
  const u1 = Math.max(rng(), 1e-9);
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.max(0, mean + z * sd);
}

async function main() {
  console.log('Resetting schema...');
  await pool.query(
    'TRUNCATE slip_legs, slips, prop_odds, props, player_game_logs, players, team_stats, games, teams RESTART IDENTITY CASCADE',
  );

  console.log('Seeding teams...');
  const teamRows = TEAMS.map((t) => [t.name, t.abbrev, 'NFL']);
  await bulkInsert('teams', ['name', 'abbrev', 'sport'], teamRows);
  const { rows: teamIdRows } = await pool.query('SELECT id, abbrev FROM teams');
  const teamIdByAbbrev = new Map<string, number>(teamIdRows.map((r) => [r.abbrev, r.id]));

  console.log(`Seeding team_stats (source: ${STATS_SOURCE})...`);
  const splits: ('overall' | 'rush' | 'pass')[] = ['overall', 'rush', 'pass'];
  const sides: ('offense' | 'defense')[] = ['offense', 'defense'];
  const teamStatsRows: unknown[][] = [];

  if (STATS_SOURCE === 'mock') {
    const statStatsRows: { abbrev: string; split: string; side: string; sr: number; epa: number }[] = [];
    const teamStatsRaw = new Map<string, any>();

    for (const split of splits) {
      for (const side of sides) {
        for (const t of TEAMS) {
          const yardsPerPlay = rand(4.6, 6.4);
          const successRate = rand(0.36, 0.52);
          const epa = rand(-0.18, 0.22);
          const explosivePct = rand(0.07, 0.16);
          const havocPct = side === 'defense' ? rand(0.14, 0.24) : rand(0.09, 0.18);
          const opponentsFacedRank = Math.floor(rand(1, 13));
          const key = `${t.abbrev}:${split}:${side}`;
          teamStatsRaw.set(key, { yardsPerPlay, successRate, epa, explosivePct, havocPct, opponentsFacedRank });
          statStatsRows.push({ abbrev: t.abbrev, split, side, sr: successRate, epa });
        }
      }
    }

    // Rank within this 12-team sample: for offense, higher is better; for defense, lower allowed is better.
    const rankMap = new Map<string, { srRank: number; epaRank: number }>();
    for (const split of splits) {
      for (const side of sides) {
        const rowsForGroup = statStatsRows.filter((r) => r.split === split && r.side === side);
        const bySr = [...rowsForGroup].sort((a, b) => (side === 'offense' ? b.sr - a.sr : a.sr - b.sr));
        const byEpa = [...rowsForGroup].sort((a, b) => (side === 'offense' ? b.epa - a.epa : a.epa - b.epa));
        bySr.forEach((r, idx) => {
          const key = `${r.abbrev}:${split}:${side}`;
          rankMap.set(key, { ...(rankMap.get(key) ?? { srRank: 0, epaRank: 0 }), srRank: idx + 1 });
        });
        byEpa.forEach((r, idx) => {
          const key = `${r.abbrev}:${split}:${side}`;
          rankMap.set(key, { ...(rankMap.get(key) ?? { srRank: 0, epaRank: 0 }), epaRank: idx + 1 });
        });
      }
    }

    for (const [key, raw] of teamStatsRaw) {
      const [abbrev, split, side] = key.split(':');
      const ranks = rankMap.get(key)!;
      teamStatsRows.push([
        teamIdByAbbrev.get(abbrev),
        SEASON,
        split,
        side,
        raw.yardsPerPlay.toFixed(2),
        raw.successRate.toFixed(3),
        raw.epa.toFixed(3),
        ranks.srRank,
        ranks.epaRank,
        raw.explosivePct.toFixed(3),
        raw.havocPct.toFixed(3),
        raw.opponentsFacedRank,
      ]);
    }
  } else {
    // Real data: offense straight from nflverse's team-season file; defense derived
    // by aggregating every OTHER team's production in games played against this
    // team (nflverse doesn't publish a separate "allowed" file — see nflverse.ts).
    // success_rate/explosive_pct/havoc_pct/opponents_faced_rank need play-by-play
    // data this build doesn't fetch, so they're left NULL rather than invented —
    // per spec: "If any required stat is unavailable from a licensed source, omit
    // the stat and note it."
    const teamSeasonRows = await loadTeamSeasonRows(SEASON);
    const weeklyRows = await loadPlayerWeekRows(SEASON);
    const seasonRowByAbbrev = new Map<string, TeamSeasonRow>(
      teamSeasonRows.filter((r) => r.season_type === 'REG').map((r) => [r.team, r]),
    );

    const derivedByKey = new Map<string, { yardsPerPlay: number; epaPerPlay: number } | null>();
    for (const split of splits) {
      for (const side of sides) {
        for (const t of TEAMS) {
          const key = `${t.abbrev}:${split}:${side}`;
          if (side === 'offense') {
            const row = seasonRowByAbbrev.get(t.abbrev);
            derivedByKey.set(key, row ? teamOffenseSplit(row, split) : null);
          } else {
            derivedByKey.set(key, teamDefenseSplitFromWeeklyRows(weeklyRows, t.abbrev, split));
          }
        }
      }
    }

    // Rank by EPA/play only — the one real per-play metric available in both modes.
    const epaRankMap = new Map<string, number>();
    for (const split of splits) {
      for (const side of sides) {
        const group = TEAMS.map((t) => ({ abbrev: t.abbrev, derived: derivedByKey.get(`${t.abbrev}:${split}:${side}`) })).filter(
          (g): g is { abbrev: string; derived: { yardsPerPlay: number; epaPerPlay: number } } => g.derived !== null,
        );
        const sorted = [...group].sort((a, b) => (side === 'offense' ? b.derived.epaPerPlay - a.derived.epaPerPlay : a.derived.epaPerPlay - b.derived.epaPerPlay));
        sorted.forEach((g, idx) => epaRankMap.set(`${g.abbrev}:${split}:${side}`, idx + 1));
      }
    }

    for (const split of splits) {
      for (const side of sides) {
        for (const t of TEAMS) {
          const key = `${t.abbrev}:${split}:${side}`;
          const derived = derivedByKey.get(key);
          if (!derived) continue; // no real data for this team/split — omit rather than fake
          teamStatsRows.push([
            teamIdByAbbrev.get(t.abbrev),
            SEASON,
            split,
            side,
            derived.yardsPerPlay.toFixed(2),
            null, // success_rate — unavailable without play-by-play
            derived.epaPerPlay.toFixed(3),
            null, // sr_rank
            epaRankMap.get(key) ?? null,
            null, // explosive_pct
            null, // havoc_pct
            null, // opponents_faced_rank
          ]);
        }
      }
    }
  }

  await bulkInsert(
    'team_stats',
    ['team_id', 'season', 'split', 'side', 'yards_per_play', 'success_rate', 'epa', 'sr_rank', 'epa_rank', 'explosive_pct', 'havoc_pct', 'opponents_faced_rank'],
    teamStatsRows,
  );

  console.log('Seeding games...');
  const today = new Date();
  const todayUtc = (hourEt: number, minuteEt = 0) => {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), hourEt + 4, minuteEt));
    return d;
  };
  const tomorrowUtc = (hourEt: number) => {
    const d = todayUtc(hourEt);
    d.setUTCDate(d.getUTCDate() + 1);
    return d;
  };

  const gameDefs = [
    { home: 'KC', away: 'DEN', kickoff: todayUtc(20, 15), spread: -2.5, total: 43.5, showcase: true, linesPosted: true },
    { home: 'ARI', away: 'SEA', kickoff: todayUtc(16, 5), spread: -1.5, total: 45.0, showcase: false, linesPosted: true },
    { home: 'MIA', away: 'BUF', kickoff: todayUtc(13, 0), spread: 3.0, total: 47.5, showcase: false, linesPosted: true },
    { home: 'PHI', away: 'DAL', kickoff: todayUtc(13, 0), spread: -3.5, total: 46.0, showcase: false, linesPosted: true },
    { home: 'GB', away: 'SF', kickoff: todayUtc(16, 25), spread: -1.0, total: 44.5, showcase: false, linesPosted: true },
    { home: 'CIN', away: 'BAL', kickoff: tomorrowUtc(20), spread: -3.5, total: 49.5, showcase: false, linesPosted: false },
  ];

  const gameRows = gameDefs.map((g) => ['NFL', g.home, g.away, g.kickoff.toISOString(), g.spread, g.total, 'scheduled']);
  await bulkInsert('games', ['sport', 'home_team', 'away_team', 'kickoff_utc', 'spread', 'total', 'status'], gameRows);
  const { rows: gameIdRows } = await pool.query('SELECT id, home_team, away_team FROM games ORDER BY id');

  console.log(`Seeding players and game logs (source: ${STATS_SOURCE})...`);
  const usedNames = new Set<string>(['Rashee Rice', 'Bo Nix', 'Marvin Mims Jr.', 'Kenneth Walker III']);
  const playerIdsByTeamPos = new Map<string, { id: number; position: string; name: string }[]>();
  const playerRows: unknown[][] = [];
  const playerMeta: { abbrev: string; position: string; name: string }[] = [];

  const realPlayerSeasonRows = STATS_SOURCE === 'nflverse' ? await loadPlayerSeasonRows(SEASON) : null;

  for (const t of TEAMS) {
    const roster =
      STATS_SOURCE === 'nflverse'
        ? realRosterForTeam(realPlayerSeasonRows!, t.abbrev).map((r) => ({ position: r.position, name: r.name }))
        : (SHOWCASE_ROSTERS[t.abbrev] ?? DEFAULT_ROSTER);
    for (const spot of roster) {
      const name = spot.name ?? randomName(usedNames);
      playerRows.push([name, spot.position, teamIdByAbbrev.get(t.abbrev), null]);
      playerMeta.push({ abbrev: t.abbrev, position: spot.position, name });
    }
  }
  await bulkInsert('players', ['name', 'position', 'team_id', 'headshot_url'], playerRows);
  const { rows: playerIdRows } = await pool.query(
    `SELECT p.id, p.name, p.position, t.abbrev FROM players p JOIN teams t ON t.id = p.team_id ORDER BY p.id`,
  );
  for (const r of playerIdRows) {
    const key = r.abbrev;
    if (!playerIdsByTeamPos.has(key)) playerIdsByTeamPos.set(key, []);
    playerIdsByTeamPos.get(key)!.push({ id: r.id, position: r.position, name: r.name });
  }

  const gameLogRows: unknown[][] = [];

  if (STATS_SOURCE === 'mock') {
    // Fixed L5 game logs for the two showcase threshold cards, reproducing the
    // design mockup's exact bar values so the rendered card matches it pixel for
    // pixel. Only meaningful in mock mode — real data isn't overridden to hit a
    // demo number.
    const FIXED_L5: Record<string, number[]> = {
      'Rashee Rice:rec_yds': [38, 141, 92, 34, 51],
      'Marvin Mims Jr.:receptions': [3, 3, 2, 8, 4],
    };

    const opponentsPool = TEAMS.map((t) => t.abbrev);
    for (const p of playerIdRows) {
      const gamesBack = 9;
      for (let w = 0; w < gamesBack; w++) {
        const date = new Date(today);
        date.setDate(date.getDate() - (gamesBack - w) * 7);
        const opponent = pick(opponentsPool.filter((a) => a !== p.abbrev));

        let passYds = 0;
        let rushYds = 0;
        let recYds = 0;
        let receptions = 0;
        let tds = 0;

        if (p.position === 'QB') {
          passYds = gaussian(245, 55);
          tds = Math.round(rand(0, 4));
        } else if (p.position === 'RB') {
          rushYds = gaussian(72, 28);
          receptions = Math.round(rand(0, 5));
          recYds = receptions * rand(4, 9);
          tds = rng() < 0.35 ? 1 : 0;
        } else if (p.position === 'WR' || p.position === 'TE') {
          const targets = Math.round(rand(2, 11));
          receptions = Math.round(targets * rand(0.45, 0.85));
          recYds = receptions * rand(8, 16);
          tds = rng() < 0.3 ? 1 : 0;
        }

        const fixedKey = `${p.name}:rec_yds`;
        const fixedRecKey = `${p.name}:receptions`;
        if (w >= gamesBack - 5 && FIXED_L5[fixedKey]) {
          recYds = FIXED_L5[fixedKey][w - (gamesBack - 5)];
        }
        if (w >= gamesBack - 5 && FIXED_L5[fixedRecKey]) {
          receptions = FIXED_L5[fixedRecKey][w - (gamesBack - 5)];
        }

        gameLogRows.push([
          p.id,
          null,
          date.toISOString().slice(0, 10),
          opponent,
          Math.round(passYds),
          Math.round(rushYds),
          Math.round(recYds),
          Math.round(receptions),
          Math.round(receptions + rand(0, 3)),
          tds,
          Math.round(rand(45, 100)),
        ]);
      }
    }
  } else {
    // Real weekly box scores. nflverse's weekly file has no literal calendar date
    // column, so the date is synthesized from season+week (a fixed per-season
    // anchor + 7 days/week) purely to preserve chronological ORDER BY date — every
    // stat value itself is the real, unmodified nflverse figure.
    const weeklyRows = await loadPlayerWeekRows(SEASON);
    const seasonAnchor = new Date(Date.UTC(SEASON, 8, 4)); // early September, week 1 anchor

    for (const p of playerIdRows) {
      const rows = weeklyRows
        .filter((r) => r.player_display_name === p.name && r.season_type === 'REG')
        .sort((a, b) => Number(a.week) - Number(b.week));

      for (const r of rows) {
        const date = new Date(seasonAnchor);
        date.setUTCDate(date.getUTCDate() + (Number(r.week) - 1) * 7);
        const tds = (Number(r.passing_tds) || 0) + (Number(r.rushing_tds) || 0) + (Number(r.receiving_tds) || 0);

        gameLogRows.push([
          p.id,
          null,
          date.toISOString().slice(0, 10),
          r.opponent_team,
          Math.round(Number(r.passing_yards) || 0),
          Math.round(Number(r.rushing_yards) || 0),
          Math.round(Number(r.receiving_yards) || 0),
          Math.round(Number(r.receptions) || 0),
          Math.round(Number(r.targets) || 0),
          tds,
          null, // snap_pct — not in the box-score file this build fetches
        ]);
      }
    }
  }

  await bulkInsert(
    'player_game_logs',
    ['player_id', 'game_id', 'date', 'opponent', 'pass_yds', 'rush_yds', 'rec_yds', 'receptions', 'targets', 'tds', 'snap_pct'],
    gameLogRows,
  );

  console.log('Seeding props for posted games...');
  const propDefs: { gameId: number; playerId: number; statType: string; line: number; createdAt: Date }[] = [];
  const propCreatedAt = new Date(today);
  propCreatedAt.setDate(propCreatedAt.getDate() - 4);

  // Only meaningful in mock mode — real data doesn't get its line overridden to
  // hit a demo number (see the game-log section above for the same rule).
  const FIXED_LINES: Record<string, number> = {
    'Rashee Rice:rec_yds': 55.5,
    'Marvin Mims Jr.:receptions': 1.5,
    'Kenneth Walker III:rush_yds': 61.5,
    'Bo Nix:pass_yds': 227.5,
  };

  const realSeasonByName = new Map((realPlayerSeasonRows ?? []).map((r) => [r.player_display_name, r]));
  function realLineFor(playerName: string, statType: string): number | null {
    const row = realSeasonByName.get(playerName);
    if (!row) return null;
    const games = Number(row.games) || 1;
    const totals: Partial<Record<string, number>> = {
      pass_yds: Number(row.passing_yards) || 0,
      rush_yds: Number(row.rushing_yards) || 0,
      rec_yds: Number(row.receiving_yards) || 0,
      receptions: Number(row.receptions) || 0,
    };
    const total = totals[statType];
    if (total === undefined) return null;
    return Math.round((total / games) * 2) / 2;
  }

  for (const g of gameIdRows) {
    const def = gameDefs.find((d) => d.home === g.home_team && d.away === g.away_team)!;
    if (!def.linesPosted) continue;

    for (const abbrev of [g.home_team, g.away_team]) {
      const roster = playerIdsByTeamPos.get(abbrev) ?? [];
      for (const player of roster) {
        const statTypes = STAT_TYPES_BY_POSITION[player.position] ?? [];
        for (const statType of statTypes) {
          const fixedKey = `${player.name}:${statType}`;
          const baseline = statBaseline(player.position, statType);
          const raw = Math.max(baseline.mean * 0.15, baseline.mean * rand(0.75, 1.25));
          const line =
            STATS_SOURCE === 'nflverse'
              ? (realLineFor(player.name, statType) ?? Math.round(raw * 2) / 2)
              : (FIXED_LINES[fixedKey] ?? Math.round(raw * 2) / 2);
          propDefs.push({ gameId: g.id, playerId: player.id, statType, line, createdAt: propCreatedAt });
        }
      }
    }
  }

  const propRows = propDefs.map((p) => [p.gameId, p.playerId, p.statType, p.line, p.createdAt.toISOString()]);
  await bulkInsert('props', ['game_id', 'player_id', 'stat_type', 'line', 'created_at'], propRows);
  const { rows: propIdRows } = await pool.query(
    `SELECT pr.id, pr.game_id, pr.player_id, pr.stat_type, pr.line,
            g.home_team, g.away_team, g.kickoff_utc, pl.name AS player_name
     FROM props pr
     JOIN games g ON g.id = pr.game_id
     JOIN players pl ON pl.id = pr.player_id
     ORDER BY pr.id`,
  );

  console.log(`Seeding odds history for ${propIdRows.length} props...`);
  const provider = new MockOddsProvider();
  const oddsRows: unknown[][] = [];

  const FIXED_ODDS: Record<string, { multiplier: number; fairPct: number }> = {
    'Rashee Rice:rec_yds': { multiplier: 2.0, fairPct: 57.8 },
    'Marvin Mims Jr.:receptions': { multiplier: 2.03, fairPct: 44.0 },
    'Kenneth Walker III:rush_yds': { multiplier: 1.85, fairPct: rateFromEdge(1.85, 3.1) },
    'Bo Nix:pass_yds': { multiplier: 1.78, fairPct: rateFromEdge(1.78, -3.1) },
  };
  function rateFromEdge(multiplier: number, edgePct: number): number {
    return Math.round((100 / multiplier + edgePct) * 10) / 10;
  }

  for (const prop of propIdRows) {
    const player = playerIdRows.find((p: any) => p.id === prop.player_id);
    const fixedKey = player ? `${player.name}:${prop.stat_type}` : '';
    const fixed = STATS_SOURCE === 'mock' ? FIXED_ODDS[fixedKey] : undefined;
    const ticks = 8;

    let last: { books: { book: string; over: number; under: number }[]; platform: Record<Side, number> } | null = null;

    for (let tick = 0; tick < ticks; tick++) {
      const isLast = tick === ticks - 1;
      const observedAt = new Date(propCreatedAt);
      observedAt.setHours(observedAt.getHours() + tick * 11);

      let books: { book: string; over: number; under: number }[];
      let platform: Record<Side, number>;

      if (isLast && fixed) {
        // Pin the final tick to the exact mockup numbers; consensus books cluster
        // tightly around the fair probability the mockup states.
        const fairP = fixed.fairPct / 100;
        books = SPORTSBOOKS.map(({ name }) => {
          const jitter = (rng() - 0.5) * 0.01;
          const p = Math.min(0.95, Math.max(0.05, fairP + jitter));
          const vig = 1.045;
          return { book: name, over: round2(1 / (p * vig)), under: round2(1 / ((1 - p) * vig)) };
        });
        platform = { over: fixed.multiplier, under: round2(1.93 / fixed.multiplier) } as Record<Side, number>;
      } else {
        const t = await provider.tick({
          propId: prop.id,
          statBaselineProbability: 0.5,
          homeTeam: prop.home_team,
          awayTeam: prop.away_team,
          kickoffUtc: prop.kickoff_utc,
          playerName: prop.player_name,
          statType: prop.stat_type,
          line: Number(prop.line),
        });
        books = t.bookQuotes.map((q) => ({ book: q.book, over: q.priceOver, under: q.priceUnder }));
        platform = t.platformMultiplier;
      }

      for (const b of books) {
        for (const side of ['over', 'under'] as Side[]) {
          const price = side === 'over' ? b.over : b.under;
          const prevPrice = last?.books.find((x) => x.book === b.book)?.[side];
          const changed = prevPrice === undefined || prevPrice !== price;
          if (changed) {
            oddsRows.push([prop.id, b.book, side, price, price, observedAt.toISOString(), tick === 0, false]);
          }
        }
      }
      for (const side of ['over', 'under'] as Side[]) {
        const price = platform[side];
        const prevPrice = last?.platform?.[side];
        const changed = prevPrice === undefined || prevPrice !== price;
        if (changed) {
          oddsRows.push([prop.id, PLATFORM_BOOK, side, price, price, observedAt.toISOString(), tick === 0, false]);
        }
      }

      last = { books, platform };
    }
  }

  function round2(x: number): number {
    return Math.round(x * 100) / 100;
  }

  await bulkInsert(
    'prop_odds',
    ['prop_id', 'book', 'side', 'price_decimal', 'multiplier', 'observed_at', 'is_open', 'is_close'],
    oddsRows,
  );

  console.log(`Seed complete: ${TEAMS.length} teams, ${gameDefs.length} games, ${playerIdRows.length} players, ${propIdRows.length} props, ${oddsRows.length} odds observations.`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
