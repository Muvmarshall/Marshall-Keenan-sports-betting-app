import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { gamesRouter } from './routes/games.js';
import { matchupRouter } from './routes/matchup.js';
import { playersRouter } from './routes/players.js';
import { movementRouter } from './routes/movement.js';
import { slipsRouter } from './routes/slips.js';
import { startPoller } from './poller.js';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api', gamesRouter);
app.use('/api', matchupRouter);
app.use('/api', playersRouter);
app.use('/api', movementRouter);
app.use('/api', slipsRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`Parlay platform API listening on :${port}`);
  if (process.env.ENABLE_POLLER !== 'false') {
    const intervalMs = Number(process.env.POLL_INTERVAL_MS ?? 60000);
    startPoller(intervalMs);
    console.log(`Odds poller running every ${intervalMs}ms`);
  }
});
