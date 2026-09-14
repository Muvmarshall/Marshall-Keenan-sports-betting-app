import { Router } from 'express';
import { pool } from '../db/pool.js';
import { getPropEdgeData } from '../lib/propEdge.js';
import { PLATFORM_BOOK } from '../odds/index.js';

export const gamesRouter = Router();

gamesRouter.get('/games', async (req, res) => {
  const sport = (req.query.sport as string) ?? 'NFL';
  const date = (req.query.date as string) ?? new Date().toISOString().slice(0, 10);

  if (sport !== 'NFL') {
    return res.json({ games: [], note: `${sport} is not live yet — only NFL is functional in v1.` });
  }

  // Slates run on the ET calendar day, not the UTC one — a night game kicking off
  // at 8:15pm ET lands after midnight UTC and would otherwise fall out of "today".
  const [y, m, d] = date.split('-').map(Number);
  const windowStart = new Date(Date.UTC(y, m - 1, d, 4, 0, 0));
  const windowEnd = new Date(Date.UTC(y, m - 1, d + 1, 4, 0, 0));

  const { rows: games } = await pool.query(
    `SELECT id, sport, home_team, away_team, kickoff_utc, spread, total, status
     FROM games
     WHERE sport = $1 AND kickoff_utc >= $2 AND kickoff_utc < $3
     ORDER BY kickoff_utc ASC`,
    [sport, windowStart.toISOString(), windowEnd.toISOString()],
  );

  const enriched = await Promise.all(
    games.map(async (g) => {
      const { rows: propRows } = await pool.query<{ id: number }>(`SELECT id FROM props WHERE game_id = $1`, [g.id]);
      let edgesFound = 0;
      for (const p of propRows) {
        const edge = await getPropEdgeData(p.id);
        if (edge.primary && edge.primary.edge > 0.01) edgesFound += 1;
      }

      const propIds = propRows.map((p) => p.id);
      let linesMoved = 0;
      if (propIds.length > 0) {
        const { rows } = await pool.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM prop_odds
           WHERE prop_id = ANY($1) AND is_open = false AND book != $2`,
          [propIds, PLATFORM_BOOK],
        );
        linesMoved = Number(rows[0].count);
      }

      return {
        id: g.id,
        sport: g.sport,
        homeTeam: g.home_team,
        awayTeam: g.away_team,
        kickoffUtc: g.kickoff_utc,
        spread: g.spread === null ? null : Number(g.spread),
        total: g.total === null ? null : Number(g.total),
        status: g.status,
        linesPosted: propIds.length > 0,
        edgesFound,
        linesMoved,
      };
    }),
  );

  res.json({ games: enriched });
});
