import { pool } from './pool.js';
import { PLATFORM_BOOK, type OddsTick } from '../odds/index.js';
import type { Side } from '@parlay/shared';

interface CandidateRow {
  book: string;
  side: Side;
  price: number;
  multiplier: number;
}

/**
 * Persists one odds tick, writing a prop_odds row only when the value actually
 * changed from the last observation for that (prop, book, side) — polling every
 * interval and writing every poll would produce millions of identical rows.
 */
export async function writeOddsTick(propId: number, tick: OddsTick, opts: { markClose?: boolean } = {}): Promise<void> {
  const rows: CandidateRow[] = [];
  for (const q of tick.bookQuotes) {
    rows.push({ book: q.book, side: 'over', price: q.priceOver, multiplier: q.priceOver });
    rows.push({ book: q.book, side: 'under', price: q.priceUnder, multiplier: q.priceUnder });
  }
  rows.push({ book: PLATFORM_BOOK, side: 'over', price: tick.platformMultiplier.over, multiplier: tick.platformMultiplier.over });
  rows.push({ book: PLATFORM_BOOK, side: 'under', price: tick.platformMultiplier.under, multiplier: tick.platformMultiplier.under });

  for (const row of rows) {
    const { rows: last } = await pool.query<{ price_decimal: string; multiplier: string }>(
      `SELECT price_decimal, multiplier FROM prop_odds
       WHERE prop_id = $1 AND book = $2 AND side = $3
       ORDER BY observed_at DESC LIMIT 1`,
      [propId, row.book, row.side],
    );
    const isFirst = last.length === 0;
    const changed = isFirst || Number(last[0].price_decimal) !== row.price || Number(last[0].multiplier) !== row.multiplier;

    if (!changed) {
      if (opts.markClose) {
        await pool.query(
          `UPDATE prop_odds SET is_close = true
           WHERE prop_id = $1 AND book = $2 AND side = $3
             AND observed_at = (SELECT MAX(observed_at) FROM prop_odds WHERE prop_id = $1 AND book = $2 AND side = $3)`,
          [propId, row.book, row.side],
        );
      }
      continue;
    }

    await pool.query(
      `INSERT INTO prop_odds (prop_id, book, side, price_decimal, multiplier, is_open, is_close)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [propId, row.book, row.side, row.price, row.multiplier, isFirst, !!opts.markClose],
    );
  }
}
