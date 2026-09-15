import { pool } from './db/pool.js';
import { getOddsProvider, PLATFORM_BOOK } from './odds/index.js';
import { writeOddsTick } from './db/writeOddsTick.js';
import { logFlagIfQualifying, closeQualifyingFlags } from './lib/edgeLogging.js';
import { settleQualifyingFlags } from './lib/settlement.js';
import type { StatType } from '@parlay/shared';

const CLOSE_WINDOW_MS = 5 * 60 * 1000;
const PLATFORM_MARGIN = 0.965;

interface ActiveProp {
  id: number;
  line: number;
  kickoff_utc: string;
  home_team: string;
  away_team: string;
  player_id: number;
  player_name: string;
  game_id: number;
  stat_type: StatType;
}

export interface PollStatus {
  lastRunAt: string | null;
  lastRunOk: boolean;
  propsSeen: number;
  rowsWritten: number;
  flagsLogged: number;
  errors: number;
}

export const pollStatus: PollStatus = {
  lastRunAt: null,
  lastRunOk: true,
  propsSeen: 0,
  rowsWritten: 0,
  flagsLogged: 0,
  errors: 0,
};

/** Polls every active prop on a fixed interval and writes odds ticks only on change. */
export function startPoller(intervalMs: number): NodeJS.Timeout {
  const provider = getOddsProvider();

  const run = async () => {
    const { rows: props } = await pool.query<ActiveProp>(
      `SELECT pr.id, pr.line, g.id AS game_id, g.kickoff_utc, g.home_team, g.away_team,
              p.id AS player_id, p.name AS player_name, pr.stat_type
       FROM props pr
       JOIN games g ON g.id = pr.game_id
       JOIN players p ON p.id = pr.player_id
       WHERE g.status != 'final'
         AND NOT EXISTS (
           SELECT 1 FROM prop_odds po WHERE po.prop_id = pr.id AND po.is_close = true
         )`,
    );

    let rowsWritten = 0;
    let flagsLogged = 0;
    let errors = 0;

    for (const prop of props) {
      try {
        const msToKickoff = new Date(prop.kickoff_utc).getTime() - Date.now();

        // Resume the mock's random walk from where the last observation left off,
        // so restarting the server doesn't jump the market back to a 50/50 baseline.
        // A real provider ignores this field entirely — it fetches the true current
        // price instead of simulating a walk.
        const { rows: lastPlatform } = await pool.query<{ price_decimal: string }>(
          `SELECT price_decimal FROM prop_odds WHERE prop_id = $1 AND book = $2 AND side = 'over'
           ORDER BY observed_at DESC LIMIT 1`,
          [prop.id, PLATFORM_BOOK],
        );
        const statBaselineProbability = lastPlatform.length
          ? PLATFORM_MARGIN / Number(lastPlatform[0].price_decimal)
          : 0.5;

        const tick = await provider.tick({
          propId: prop.id,
          statBaselineProbability,
          homeTeam: prop.home_team,
          awayTeam: prop.away_team,
          kickoffUtc: prop.kickoff_utc,
          playerName: prop.player_name,
          statType: prop.stat_type,
          line: Number(prop.line),
        });
        rowsWritten += await writeOddsTick(prop.id, tick, { markClose: msToKickoff <= CLOSE_WINDOW_MS });

        await logFlagIfQualifying({
          propId: prop.id,
          playerId: prop.player_id,
          gameId: prop.game_id,
          statType: prop.stat_type,
        });
        flagsLogged += 1;
      } catch (err) {
        // One prop failing to match/fetch (common with a live feed — a player not
        // posted this week, a market-key mismatch) must not stop the rest from
        // updating.
        errors += 1;
        console.error(`poll failed for prop ${prop.id} (${prop.player_name} ${prop.stat_type}):`, err);
      }
    }

    const closed = await closeQualifyingFlags().catch((err) => {
      console.error('closeQualifyingFlags failed:', err);
      return 0;
    });
    const settled = await settleQualifyingFlags().catch((err) => {
      console.error('settleQualifyingFlags failed:', err);
      return 0;
    });

    pollStatus.lastRunAt = new Date().toISOString();
    pollStatus.lastRunOk = errors === 0;
    pollStatus.propsSeen = props.length;
    pollStatus.rowsWritten = rowsWritten;
    pollStatus.flagsLogged = flagsLogged;
    pollStatus.errors = errors;

    console.log(
      JSON.stringify({
        event: 'poll_complete',
        propsSeen: props.length,
        rowsWritten,
        flagsChecked: flagsLogged,
        edgeClosesWritten: closed,
        edgeResultsSettled: settled,
        errors,
      }),
    );
  };

  // Deliberately does not fire an immediate poll on boot: that would blow away the
  // seed script's opening/closing observations the instant the server starts.
  return setInterval(
    () =>
      run().catch((err) => {
        pollStatus.lastRunAt = new Date().toISOString();
        pollStatus.lastRunOk = false;
        console.error('poller tick failed', err);
      }),
    intervalMs,
  );
}
