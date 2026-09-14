import { Router } from 'express';
import { pool } from '../db/pool.js';
import { getPropEdgeData } from '../lib/propEdge.js';

export const playersRouter = Router();

const SEASON = 2025;
const STAT_LABELS: Record<string, string> = {
  pass_yds: 'Passing yards',
  rush_yds: 'Rushing yards',
  rec_yds: 'Receiving yards',
  receptions: 'Receptions',
  pass_tds: 'Passing touchdowns',
  rush_tds: 'Rushing touchdowns',
  rec_tds: 'Receiving touchdowns',
};

function statValue(log: any, statType: string): number {
  switch (statType) {
    case 'pass_yds':
      return Number(log.pass_yds);
    case 'rush_yds':
      return Number(log.rush_yds);
    case 'rec_yds':
      return Number(log.rec_yds);
    case 'receptions':
      return Number(log.receptions);
    case 'pass_tds':
    case 'rush_tds':
    case 'rec_tds':
      return Number(log.tds);
    default:
      return 0;
  }
}

function hitRate(values: number[], line: number): number {
  if (values.length === 0) return 0;
  const hits = values.filter((v) => v > line).length;
  return hits / values.length;
}

playersRouter.get('/games/:id/players', async (req, res) => {
  const gameId = Number(req.params.id);
  const { rows: gameRows } = await pool.query(`SELECT id, home_team, away_team FROM games WHERE id = $1`, [gameId]);
  const game = gameRows[0];
  if (!game) return res.status(404).json({ error: 'Game not found' });

  const { rows: players } = await pool.query(
    `SELECT p.id, p.name, p.position, t.abbrev AS team_abbrev
     FROM players p
     JOIN teams t ON t.id = p.team_id
     WHERE t.abbrev = ANY($1) AND p.position != 'TEAM'
     ORDER BY p.position, p.name`,
    [[game.home_team, game.away_team]],
  );

  const result = await Promise.all(
    players.map(async (player) => {
      const opponentAbbrev = player.team_abbrev === game.home_team ? game.away_team : game.home_team;

      const { rows: logs } = await pool.query(
        `SELECT * FROM player_game_logs WHERE player_id = $1 ORDER BY date DESC LIMIT 17`,
        [player.id],
      );

      const { rows: props } = await pool.query(
        `SELECT id, stat_type, line FROM props WHERE game_id = $1 AND player_id = $2 ORDER BY created_at DESC`,
        [gameId, player.id],
      );

      // Only the most recent prop per stat_type is "live" — earlier ones are history.
      const latestPropByStat = new Map<string, { id: number; stat_type: string; line: number }>();
      for (const p of props) {
        if (!latestPropByStat.has(p.stat_type)) latestPropByStat.set(p.stat_type, p);
      }

      const relevantSplit = player.position === 'RB' ? 'rush' : 'pass';
      const { rows: oppDefRows } = await pool.query(
        `SELECT ts.sr_rank, ts.epa_rank FROM team_stats ts
         JOIN teams t ON t.id = ts.team_id
         WHERE t.abbrev = $1 AND ts.season = $2 AND ts.split = $3 AND ts.side = 'defense'`,
        [opponentAbbrev, SEASON, relevantSplit],
      );
      const opponentRank = oppDefRows[0] ?? null;

      const propCards = await Promise.all(
        Array.from(latestPropByStat.values()).map(async (prop) => {
          const values = logs.map((log) => statValue(log, prop.stat_type));
          const l5 = values.slice(0, 5);
          const l10 = values.slice(0, 10);
          const edge = await getPropEdgeData(prop.id);

          return {
            propId: prop.id,
            statType: prop.stat_type,
            statLabel: STAT_LABELS[prop.stat_type] ?? prop.stat_type,
            line: Number(prop.line),
            last5: l5.slice().reverse(),
            hitRateL5: hitRate(l5, Number(prop.line)),
            hitRateL10: hitRate(l10, Number(prop.line)),
            hitRateSeason: hitRate(values, Number(prop.line)),
            seasonAverage: values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0,
            edge,
          };
        }),
      );

      if (propCards.length === 0) return null;

      return {
        playerId: player.id,
        name: player.name,
        position: player.position,
        team: player.team_abbrev,
        opponentRank: opponentRank
          ? { split: relevantSplit, srRank: opponentRank.sr_rank, epaRank: opponentRank.epa_rank }
          : null,
        props: propCards,
      };
    }),
  );

  const grouped: Record<string, any[]> = {};
  for (const p of result) {
    if (!p) continue;
    grouped[p.position] = grouped[p.position] ?? [];
    grouped[p.position].push(p);
  }

  res.json({ positions: grouped });
});
