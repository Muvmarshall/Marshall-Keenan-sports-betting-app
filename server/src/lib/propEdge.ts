import { pool } from '../db/pool.js';
import { PLATFORM_BOOK } from '../odds/index.js';
import { consensusFairProbability, edgeForSelection, edgeCallLabel, type Side } from '@parlay/shared';

export interface PropEdgeSide {
  side: Side;
  multiplier: number;
  breakeven: number;
  fairProbability: number;
  edge: number;
  label: ReturnType<typeof edgeCallLabel>;
}

export interface PropEdgeData {
  over: PropEdgeSide | null;
  under: PropEdgeSide | null;
  /** whichever side currently carries the larger (signed) edge */
  primary: PropEdgeSide | null;
}

interface LatestRow {
  book: string;
  side: Side;
  price_decimal: string;
}

/** Latest known consensus + platform state for a single prop, used to compute edge on demand. */
export async function getPropEdgeData(propId: number): Promise<PropEdgeData> {
  const { rows } = await pool.query<LatestRow>(
    `SELECT DISTINCT ON (book, side) book, side, price_decimal
     FROM prop_odds
     WHERE prop_id = $1
     ORDER BY book, side, observed_at DESC`,
    [propId],
  );

  const result: PropEdgeData = { over: null, under: null, primary: null };

  for (const side of ['over', 'under'] as Side[]) {
    const bookRows = rows.filter((r) => r.side === side && r.book !== PLATFORM_BOOK);
    const platformRow = rows.find((r) => r.side === side && r.book === PLATFORM_BOOK);
    if (bookRows.length === 0 || !platformRow) continue;

    // De-vigging needs each book's own over AND under price, so pair them up.
    const paired = bookRows
      .map((r) => {
        const opposite = rows.find((o) => o.book === r.book && o.side !== side);
        if (!opposite) return null;
        const priceThis = Number(r.price_decimal);
        const priceOpp = Number(opposite.price_decimal);
        return {
          book: r.book,
          priceOver: side === 'over' ? priceThis : priceOpp,
          priceUnder: side === 'over' ? priceOpp : priceThis,
          weight: 1,
          observedAt: new Date().toISOString(),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    if (paired.length === 0) continue;

    const fair = consensusFairProbability(paired);
    const fairProbability = side === 'over' ? fair.pOver : fair.pUnder;
    const multiplier = Number(platformRow.price_decimal);
    const edgeResult = edgeForSelection(multiplier, fairProbability);

    result[side] = {
      side,
      multiplier,
      breakeven: edgeResult.breakeven,
      fairProbability,
      edge: edgeResult.edge,
      label: edgeCallLabel(edgeResult.edge),
    };
  }

  if (result.over && result.under) {
    result.primary = result.over.edge >= result.under.edge ? result.over : result.under;
  } else {
    result.primary = result.over ?? result.under ?? null;
  }

  return result;
}
