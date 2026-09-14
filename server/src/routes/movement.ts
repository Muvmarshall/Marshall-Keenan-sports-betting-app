import { Router } from 'express';
import { pool } from '../db/pool.js';
import { PLATFORM_BOOK } from '../odds/index.js';

export const movementRouter = Router();

const STAT_LABELS: Record<string, string> = {
  pass_yds: 'Passing yards',
  rush_yds: 'Rushing yards',
  rec_yds: 'Receiving yards',
  receptions: 'Receptions',
  pass_tds: 'Passing touchdowns',
  rush_tds: 'Rushing touchdowns',
  rec_tds: 'Receiving touchdowns',
};

function humanizeMinutes(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}

movementRouter.get('/games/:id/movement', async (req, res) => {
  const gameId = Number(req.params.id);

  const { rows: props } = await pool.query(
    `SELECT pr.id, pr.player_id, pr.stat_type, pr.line, pr.created_at, p.name AS player_name, t.abbrev AS team_abbrev
     FROM props pr
     JOIN players p ON p.id = pr.player_id
     JOIN teams t ON t.id = p.team_id
     WHERE pr.game_id = $1
     ORDER BY pr.player_id, pr.stat_type, pr.created_at ASC`,
    [gameId],
  );

  const marketKey = (p: any) => `${p.player_id}:${p.stat_type}`;
  const markets = new Map<string, typeof props>();
  for (const p of props) {
    const key = marketKey(p);
    if (!markets.has(key)) markets.set(key, []);
    markets.get(key)!.push(p);
  }

  const marketResults = [];
  for (const [, marketProps] of markets) {
    const propIds = marketProps.map((p: any) => p.id);
    const { rows: odds } = await pool.query(
      `SELECT prop_id, book, side, price_decimal, observed_at
       FROM prop_odds WHERE prop_id = ANY($1) ORDER BY observed_at ASC`,
      [propIds],
    );

    const overOdds = odds.filter((o) => o.side === 'over');
    const bookRows = overOdds.filter((o) => o.book !== PLATFORM_BOOK);
    const platformRows = overOdds.filter((o) => o.book === PLATFORM_BOOK);

    // Steam detection: group by distinct timestamp, compare consecutive ticks.
    const timestamps = [...new Set(bookRows.map((r) => r.observed_at.toISOString()))].sort();
    const steamFlags: { from: string; to: string; booksMoved: number; direction: 'up' | 'down' }[] = [];
    for (let i = 1; i < timestamps.length; i++) {
      const t0 = timestamps[i - 1];
      const t1 = timestamps[i];
      const gapMs = new Date(t1).getTime() - new Date(t0).getTime();
      if (gapMs > 10 * 60 * 1000) continue;

      const byBookAtT0 = new Map(bookRows.filter((r) => r.observed_at.toISOString() === t0).map((r) => [r.book, Number(r.price_decimal)]));
      const byBookAtT1 = bookRows.filter((r) => r.observed_at.toISOString() === t1);

      let up = 0;
      let down = 0;
      for (const row of byBookAtT1) {
        const prev = byBookAtT0.get(row.book);
        if (prev === undefined) continue;
        const cur = Number(row.price_decimal);
        if (cur > prev) up += 1;
        else if (cur < prev) down += 1;
      }
      if (up >= 3) steamFlags.push({ from: t0, to: t1, booksMoved: up, direction: 'up' });
      if (down >= 3) steamFlags.push({ from: t0, to: t1, booksMoved: down, direction: 'down' });
    }

    const openLine = Number(marketProps[0].line);
    const currentLine = Number(marketProps[marketProps.length - 1].line);
    const lineHistory = marketProps.map((p: any) => ({ at: p.created_at, line: Number(p.line) }));

    const distinctBooksMoved = new Set(bookRows.map((r) => r.book)).size;
    const first = bookRows[0]?.observed_at ?? marketProps[0].created_at;
    const last = bookRows[bookRows.length - 1]?.observed_at ?? marketProps[0].created_at;
    const durationMs = new Date(last).getTime() - new Date(first).getTime();

    const summary =
      openLine !== currentLine
        ? `This line moved from ${openLine} to ${currentLine} across ${distinctBooksMoved} books in ${humanizeMinutes(durationMs)}.`
        : `No line movement yet — still at ${currentLine}.`;

    marketResults.push({
      playerId: marketProps[0].player_id,
      playerName: marketProps[0].player_name,
      team: marketProps[0].team_abbrev,
      statType: marketProps[0].stat_type,
      statLabel: STAT_LABELS[marketProps[0].stat_type] ?? marketProps[0].stat_type,
      openLine,
      currentLine,
      lineHistory,
      priceHistory: {
        books: bookRows.map((r) => ({ book: r.book, price: Number(r.price_decimal), at: r.observed_at })),
        platform: platformRows.map((r) => ({ multiplier: Number(r.price_decimal), at: r.observed_at })),
      },
      steamFlags,
      summary,
    });
  }

  res.json({ markets: marketResults });
});
