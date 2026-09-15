import { Router } from 'express';
import { pool } from '../db/pool.js';
import { generateMatchupInsights, type TeamStatSide } from '../lib/insights.js';

export const matchupRouter = Router();

const SEASON = 2025;

matchupRouter.get('/games/:id/matchup', async (req, res) => {
  const gameId = Number(req.params.id);
  const { rows: gameRows } = await pool.query(
    `SELECT id, home_team, away_team, kickoff_utc, spread, total FROM games WHERE id = $1`,
    [gameId],
  );
  const game = gameRows[0];
  if (!game) return res.status(404).json({ error: 'Game not found' });

  const { rows: statRows } = await pool.query(
    `SELECT t.abbrev AS team_abbrev, ts.*
     FROM team_stats ts
     JOIN teams t ON t.id = ts.team_id
     WHERE t.abbrev = ANY($1) AND ts.season = $2`,
    [[game.home_team, game.away_team], SEASON],
  );

  // Number(null) === 0 in JS — that would silently turn "unavailable" (real NULL,
  // when a stat has no licensed source; see nflverse.ts) into a fake zero. These
  // fields must stay null when the DB value is null.
  const nullableNumber = (v: unknown): number | null => (v === null ? null : Number(v));

  const toSide = (r: any): TeamStatSide => ({
    teamAbbrev: r.team_abbrev,
    split: r.split,
    side: r.side,
    yardsPerPlay: Number(r.yards_per_play),
    successRate: nullableNumber(r.success_rate),
    epa: Number(r.epa),
    srRank: r.sr_rank,
    epaRank: r.epa_rank,
    explosivePct: nullableNumber(r.explosive_pct),
    havocPct: nullableNumber(r.havoc_pct),
    opponentsFacedRank: r.opponents_faced_rank,
  });

  const sides = statRows.map(toSide);
  const homeOffense = sides.filter((s) => s.teamAbbrev === game.home_team && s.side === 'offense');
  const homeDefense = sides.filter((s) => s.teamAbbrev === game.home_team && s.side === 'defense');
  const awayOffense = sides.filter((s) => s.teamAbbrev === game.away_team && s.side === 'offense');
  const awayDefense = sides.filter((s) => s.teamAbbrev === game.away_team && s.side === 'defense');

  const insights = [
    ...generateMatchupInsights(awayDefense, homeOffense),
    ...generateMatchupInsights(homeDefense, awayOffense),
  ];

  res.json({
    game: {
      id: game.id,
      homeTeam: game.home_team,
      awayTeam: game.away_team,
      kickoffUtc: game.kickoff_utc,
      spread: Number(game.spread),
      total: Number(game.total),
    },
    home: { offense: homeOffense, defense: homeDefense },
    away: { offense: awayOffense, defense: awayDefense },
    insights,
  });
});
