import { app } from './app.js';
import { startPoller } from './poller.js';
import { startDailyDigestScheduler } from './lib/dailyDigest.js';

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`Parlay platform API listening on :${port}`);
  if (process.env.ENABLE_POLLER !== 'false') {
    const intervalMs = Number(process.env.POLL_INTERVAL_MS ?? 60000);
    startPoller(intervalMs);
    console.log(`Odds poller running every ${intervalMs}ms`);
  }
  if (process.env.ENABLE_DAILY_DIGEST !== 'false') {
    startDailyDigestScheduler();
    console.log('Daily grading digest scheduler running (checks hourly, sends ~09:00 ET)');
  }
});
