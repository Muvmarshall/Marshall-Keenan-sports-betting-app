import { Router } from 'express';
import { pool } from '../db/pool.js';
import { pollStatus } from '../poller.js';

export const healthRouter = Router();

/**
 * Reports feed status, the last successful poll, and row counts for the three
 * grading-pipeline tables — per Phase 2 spec item 7. On a serverless deploy (no
 * persistent process, so the poller never runs there — see api/[...all].ts),
 * pollStatus honestly reports "never polled" rather than faking a heartbeat.
 */
healthRouter.get('/health', async (_req, res) => {
  const counts = await pool
    .query<{ table_name: string; count: string }>(
      `SELECT 'edge_log' AS table_name, COUNT(*)::text AS count FROM edge_log
       UNION ALL
       SELECT 'edge_close', COUNT(*)::text FROM edge_close
       UNION ALL
       SELECT 'edge_result', COUNT(*)::text FROM edge_result`,
    )
    .then((r) => Object.fromEntries(r.rows.map((row) => [row.table_name, Number(row.count)])))
    .catch(() => null);

  const dbOk = counts !== null;

  res.json({
    ok: dbOk,
    database: dbOk ? 'connected' : 'unreachable',
    poller: {
      running: pollStatus.lastRunAt !== null,
      lastRunAt: pollStatus.lastRunAt,
      lastRunOk: pollStatus.lastRunOk,
      propsSeenLastRun: pollStatus.propsSeen,
      rowsWrittenLastRun: pollStatus.rowsWritten,
      errorsLastRun: pollStatus.errors,
      // So the client can judge staleness relative to how often this deployment
      // actually polls — a live feed on a free key might poll every 6 hours, and
      // that's not "unreachable," it's normal. See web FeedStatusContext.
      pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 60000),
    },
    rowCounts: counts ?? { edge_log: null, edge_close: null, edge_result: null },
  });
});
