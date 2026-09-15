import { pool } from './db/pool.js';
import { getOddsProvider, PLATFORM_BOOK } from './odds/index.js';
import { writeOddsTick } from './db/writeOddsTick.js';
import type { StatType } from '@parlay/shared';

const CLOSE_WINDOW_MS = 5 * 60 * 1000;
const PLATFORM_MARGIN = 0.965;

interface ActiveProp {
  id: number;
  line: number;
  kickoff_utc: string;
  home_team: string;
  away_team: string;
  player_name: string;
  stat_type: StatType;
}

/** Polls every active prop on a fixed interval and writes odds ticks only on change. */
export function startPoller(intervalMs: number): NodeJS.Timeout {
  const provider = getOddsProvider();

  const run = async () => {
    const { rows: props } = await pool.query<ActiveProp>(
      `SELECT pr.id, pr.line, g.kickoff_utc, g.home_team, g.away_team, p.name AS player_name, pr.stat_type
       FROM props pr
       JOIN games g ON g.id = pr.game_id
       JOIN players p ON p.id = pr.player_id
       WHERE g.status != 'final'`,
    );

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
        await writeOddsTick(prop.id, tick, { markClose: msToKickoff <= CLOSE_WINDOW_MS });
      } catch (err) {
        // One prop failing to match/fetch (common with a live feed — a player not
        // posted this week, a market-key mismatch) must not stop the rest from
        // updating.
        console.error(`poll failed for prop ${prop.id} (${prop.player_name} ${prop.stat_type}):`, err);
      }
    }
  };

  // Deliberately does not fire an immediate poll on boot: that would blow away the
  // seed script's opening/closing observations the instant the server starts.
  return setInterval(() => run().catch((err) => console.error('poller tick failed', err)), intervalMs);
}
