import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { gamesRouter } from './routes/games.js';
import { matchupRouter } from './routes/matchup.js';
import { playersRouter } from './routes/players.js';
import { movementRouter } from './routes/movement.js';
import { slipsRouter } from './routes/slips.js';

/**
 * The Express app alone, with no listener attached — reused by index.ts (a normal
 * persistent process for local dev or an always-on host) and by api/index.ts (a
 * Vercel serverless function, which needs the request handler but must never call
 * .listen() itself).
 */
export const app = express();
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
