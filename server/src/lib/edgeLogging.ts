import { pool } from '../db/pool.js';
import { getPropEdgeData, type PropEdgeSide } from './propEdge.js';
import type { StatType } from '@parlay/shared';

const FLAG_THRESHOLD = 0.01;
const CLOSE_LAG_MS = 5 * 60 * 1000; // matches poller.ts's CLOSE_WINDOW_MS

interface FlaggablePropMeta {
  propId: number;
  playerId: number;
  gameId: number;
  statType: StatType;
}

/**
 * Called once per prop per poll, right after a fresh odds tick is written. Writes
 * one edge_log row whenever the current primary-side edge clears the 1% threshold —
 * deliberately every qualifying poll, not deduplicated per prop. See schema.sql for
 * why: each observation is graded independently against its own closing line.
 */
export async function logFlagIfQualifying(meta: FlaggablePropMeta): Promise<void> {
  const edge = await getPropEdgeData(meta.propId);
  const primary = edge.primary;
  if (!primary || Math.abs(primary.edge) < FLAG_THRESHOLD) return;

  const { rows } = await pool.query<{ line: number }>(`SELECT line FROM props WHERE id = $1`, [meta.propId]);
  if (rows.length === 0) return;

  await pool.query(
    `INSERT INTO edge_log
       (prop_id, player_id, game_id, stat_type, side, line_at_flag, multiplier_at_flag,
        fair_prob_at_flag, edge_at_flag, books_used)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      meta.propId,
      meta.playerId,
      meta.gameId,
      meta.statType,
      primary.side,
      Number(rows[0].line),
      primary.multiplier,
      primary.fairProbability,
      primary.edge,
      primary.booksUsed,
    ],
  );
}

interface OpenFlagRow {
  id: number;
  prop_id: number;
  side: 'over' | 'under';
  line_at_flag: string;
  fair_prob_at_flag: string;
  edge_at_flag: string;
}

/**
 * Writes edge_close for every edge_log row whose game has passed kickoff and whose
 * prop now has a closing (is_close) odds observation. Idempotent — a row already
 * closed is never revisited (edge_log_id is the primary key on edge_close).
 */
export async function closeQualifyingFlags(): Promise<number> {
  const { rows: openFlags } = await pool.query<OpenFlagRow>(
    `SELECT el.id, el.prop_id, el.side, el.line_at_flag, el.fair_prob_at_flag, el.edge_at_flag
     FROM edge_log el
     JOIN games g ON g.id = el.game_id
     LEFT JOIN edge_close ec ON ec.edge_log_id = el.id
     WHERE ec.edge_log_id IS NULL
       AND g.kickoff_utc <= now() - interval '1 millisecond' * $1
       AND EXISTS (SELECT 1 FROM prop_odds po WHERE po.prop_id = el.prop_id AND po.is_close = true)`,
    [CLOSE_LAG_MS],
  );

  let closed = 0;
  for (const flag of openFlags) {
    const closingEdge = await getPropEdgeData(flag.prop_id);
    const closingSide: PropEdgeSide | null = flag.side === 'over' ? closingEdge.over : closingEdge.under;
    if (!closingSide) continue;

    const { rows: propRows } = await pool.query<{ line: number }>(`SELECT line FROM props WHERE id = $1`, [
      flag.prop_id,
    ]);
    const lineAtClose = propRows.length ? Number(propRows[0].line) : Number(flag.line_at_flag);

    const fairAtFlag = Number(flag.fair_prob_at_flag);
    const clvPoints = closingSide.fairProbability - fairAtFlag;
    // "Moved toward the flag" means the market came around to agreeing with the
    // flagged side after we flagged it — clv_points signed toward that side, so a
    // positive value already means exactly that.
    const lineMovedTowardFlag = clvPoints > 0;

    await pool.query(
      `INSERT INTO edge_close (edge_log_id, line_at_close, multiplier_at_close, fair_prob_at_close, line_moved_toward_flag, clv_points)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [flag.id, lineAtClose, closingSide.multiplier, closingSide.fairProbability, lineMovedTowardFlag, clvPoints],
    );
    closed += 1;
  }
  return closed;
}
