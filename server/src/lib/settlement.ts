import { pool } from '../db/pool.js';
import type { StatType } from '@parlay/shared';

const GAME_DURATION_MS = 3.5 * 60 * 60 * 1000;

export interface ActualStatResolver {
  sourceName: string;
  /** Returns the real stat value once known, or null if not yet available (stays ungraded — never guess). */
  resolve(playerId: number, gameId: number, statType: StatType): Promise<number | null>;
}

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

/**
 * For mock data only: there is no real game to observe, so this generates a
 * plausible outcome from the player's own recent average rather than inventing a
 * number from nothing. Every edge_result row this writes is tagged
 * source='mock-settlement' — never presented as a real outcome. See README
 * "Data provenance" for the real (nflverse) resolver and why it isn't wired in by
 * default yet.
 */
export class MockSettlementResolver implements ActualStatResolver {
  sourceName = 'mock-settlement';

  async resolve(playerId: number, _gameId: number, statType: StatType): Promise<number | null> {
    const column = STAT_TYPE_COLUMN[statType];
    if (!column) return null;

    const { rows } = await pool.query<{ v: string }>(
      `SELECT ${column} AS v FROM player_game_logs WHERE player_id = $1 ORDER BY date DESC LIMIT 5`,
      [playerId],
    );
    if (rows.length === 0) return 0;

    const values = rows.map((r) => Number(r.v));
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const sd = Math.max(1, mean * 0.35);

    const rng = mulberry32(playerId * 7919 + statType.length * 104729);
    const u1 = Math.max(rng(), 1e-9);
    const u2 = rng();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return Math.max(0, Math.round(mean + z * sd));
  }
}

const STAT_TYPE_COLUMN: Partial<Record<StatType, string>> = {
  pass_yds: 'pass_yds',
  rush_yds: 'rush_yds',
  rec_yds: 'rec_yds',
  receptions: 'receptions',
  pass_tds: 'tds',
  rush_tds: 'tds',
  rec_tds: 'tds',
};

let resolver: ActualStatResolver = new MockSettlementResolver();
export function setActualStatResolver(r: ActualStatResolver): void {
  resolver = r;
}

interface ClosedUngraded {
  edge_log_id: number;
  player_id: number;
  game_id: number;
  stat_type: StatType;
  side: 'over' | 'under';
  line_at_flag: string;
  kickoff_utc: string;
}

/** Settles every edge_close row without a result, once the game is old enough to plausibly be final. */
export async function settleQualifyingFlags(): Promise<number> {
  const { rows } = await pool.query<ClosedUngraded>(
    `SELECT ec.edge_log_id, el.player_id, el.game_id, el.stat_type, el.side, el.line_at_flag, g.kickoff_utc
     FROM edge_close ec
     JOIN edge_log el ON el.id = ec.edge_log_id
     JOIN games g ON g.id = el.game_id
     LEFT JOIN edge_result er ON er.edge_log_id = ec.edge_log_id
     WHERE er.edge_log_id IS NULL
       AND g.kickoff_utc <= now() - interval '1 millisecond' * $1`,
    [GAME_DURATION_MS],
  );

  let settled = 0;
  for (const row of rows) {
    const actual = await resolver.resolve(row.player_id, row.game_id, row.stat_type);
    if (actual === null) continue; // genuinely not known yet — leave ungraded, never fabricate

    const line = Number(row.line_at_flag);
    const hit = row.side === 'over' ? actual > line : actual < line;

    await pool.query(
      `INSERT INTO edge_result (edge_log_id, actual_stat_value, hit, source) VALUES ($1, $2, $3, $4)`,
      [row.edge_log_id, actual, hit, resolver.sourceName],
    );
    settled += 1;
  }
  return settled;
}
