import { pool } from './db/pool.js';
import { getOddsProvider, PLATFORM_BOOK } from './odds/index.js';
import { writeOddsTick } from './db/writeOddsTick.js';

const CLOSE_WINDOW_MS = 5 * 60 * 1000;
const PLATFORM_MARGIN = 0.965;

/** Polls every active prop on a fixed interval and writes odds ticks only on change. */
export function startPoller(intervalMs: number): NodeJS.Timeout {
  const provider = getOddsProvider();

  const run = async () => {
    const { rows: props } = await pool.query<{ id: number; line: number; kickoff_utc: string }>(
      `SELECT pr.id, pr.line, g.kickoff_utc
       FROM props pr
       JOIN games g ON g.id = pr.game_id
       WHERE g.status != 'final'`,
    );

    for (const prop of props) {
      const msToKickoff = new Date(prop.kickoff_utc).getTime() - Date.now();

      // Resume the mock's random walk from where the last observation left off,
      // so restarting the server doesn't jump the market back to a 50/50 baseline.
      const { rows: lastPlatform } = await pool.query<{ price_decimal: string }>(
        `SELECT price_decimal FROM prop_odds WHERE prop_id = $1 AND book = $2 AND side = 'over'
         ORDER BY observed_at DESC LIMIT 1`,
        [prop.id, PLATFORM_BOOK],
      );
      const statBaselineProbability = lastPlatform.length
        ? PLATFORM_MARGIN / Number(lastPlatform[0].price_decimal)
        : 0.5;

      const tick = provider.tick({ propId: prop.id, statBaselineProbability });
      await writeOddsTick(prop.id, tick, { markClose: msToKickoff <= CLOSE_WINDOW_MS });
    }
  };

  // Deliberately does not fire an immediate poll on boot: that would blow away the
  // seed script's opening/closing observations the instant the server starts.
  return setInterval(() => run().catch((err) => console.error('poller tick failed', err)), intervalMs);
}
