import { Router } from 'express';
import { pool } from '../db/pool.js';

export const resultsRouter = Router();

const SAMPLE_SIZE_WARNING_THRESHOLD = 100;

function withWarning<T extends { n: number }>(row: T) {
  return { ...row, sampleSizeWarning: row.n < SAMPLE_SIZE_WARNING_THRESHOLD };
}

/**
 * Public track-record data — reads only from edge_log/edge_close/edge_result,
 * never hand-entered. Closing-line value is the headline metric (a single
 * slate's win rate is noise; line movement is signal within days — see the
 * Phase 2 spec). Every aggregate under 100 flags is marked with a sample-size
 * warning rather than presented with false confidence.
 */
resultsRouter.get('/results', async (_req, res) => {
  const { rows: overviewRows } = await pool.query<{ total: string; earliest: string | null; latest: string | null }>(
    `SELECT COUNT(*)::text AS total, MIN(observed_at) AS earliest, MAX(observed_at) AS latest FROM edge_log`,
  );
  const overview = overviewRows[0];

  const { rows: clvRows } = await pool.query<{ n: string; avg_clv: string | null; pct_moved: string | null }>(
    `SELECT COUNT(*)::text AS n,
            AVG(clv_points) AS avg_clv,
            AVG(CASE WHEN line_moved_toward_flag THEN 1.0 ELSE 0.0 END) AS pct_moved
     FROM edge_close`,
  );
  const clv = clvRows[0];

  const { rows: hitRows } = await pool.query<{
    n: string;
    hit_rate: string | null;
    expected_breakeven: string | null;
    expected_fair: string | null;
  }>(
    `SELECT COUNT(*)::text AS n,
            AVG(CASE WHEN er.hit THEN 1.0 ELSE 0.0 END) AS hit_rate,
            AVG(1.0 / el.multiplier_at_flag) AS expected_breakeven,
            AVG(el.fair_prob_at_flag) AS expected_fair
     FROM edge_result er
     JOIN edge_log el ON el.id = er.edge_log_id`,
  );
  const hit = hitRows[0];

  const { rows: byStatType } = await pool.query<{
    stat_type: string;
    n: string;
    avg_edge: string;
    closed_n: string;
    avg_clv: string | null;
    settled_n: string;
    hit_rate: string | null;
  }>(
    `SELECT el.stat_type,
            COUNT(*)::text AS n,
            AVG(el.edge_at_flag) AS avg_edge,
            COUNT(ec.edge_log_id)::text AS closed_n,
            AVG(ec.clv_points) AS avg_clv,
            COUNT(er.edge_log_id)::text AS settled_n,
            -- Nested CASE (no outer ELSE) yields NULL for unsettled rows, which AVG
            -- ignores — a flat ELSE 0.0 would count every ungraded flag as a miss.
            AVG(CASE WHEN er.edge_log_id IS NOT NULL THEN (CASE WHEN er.hit THEN 1.0 ELSE 0.0 END) END) AS hit_rate
     FROM edge_log el
     LEFT JOIN edge_close ec ON ec.edge_log_id = el.id
     LEFT JOIN edge_result er ON er.edge_log_id = el.id
     GROUP BY el.stat_type
     ORDER BY el.stat_type`,
  );

  const { rows: byEdgeBand } = await pool.query<{
    band: string;
    n: string;
    closed_n: string;
    avg_clv: string | null;
    settled_n: string;
    hit_rate: string | null;
  }>(
    `SELECT
       CASE
         WHEN ABS(el.edge_at_flag) < 0.03 THEN '1-3%'
         WHEN ABS(el.edge_at_flag) < 0.05 THEN '3-5%'
         WHEN ABS(el.edge_at_flag) < 0.10 THEN '5-10%'
         ELSE '10%+'
       END AS band,
       COUNT(*)::text AS n,
       COUNT(ec.edge_log_id)::text AS closed_n,
       AVG(ec.clv_points) AS avg_clv,
       COUNT(er.edge_log_id)::text AS settled_n,
       AVG(CASE WHEN er.edge_log_id IS NOT NULL THEN (CASE WHEN er.hit THEN 1.0 ELSE 0.0 END) END) AS hit_rate
     FROM edge_log el
     LEFT JOIN edge_close ec ON ec.edge_log_id = el.id
     LEFT JOIN edge_result er ON er.edge_log_id = el.id
     GROUP BY band
     ORDER BY MIN(ABS(el.edge_at_flag))`,
  );

  const { rows: byWeek } = await pool.query<{
    week_start: string;
    n: string;
    closed_n: string;
    avg_clv: string | null;
    settled_n: string;
    hit_rate: string | null;
  }>(
    `SELECT date_trunc('week', el.observed_at)::text AS week_start,
            COUNT(*)::text AS n,
            COUNT(ec.edge_log_id)::text AS closed_n,
            AVG(ec.clv_points) AS avg_clv,
            COUNT(er.edge_log_id)::text AS settled_n,
            AVG(CASE WHEN er.edge_log_id IS NOT NULL THEN (CASE WHEN er.hit THEN 1.0 ELSE 0.0 END) END) AS hit_rate
     FROM edge_log el
     LEFT JOIN edge_close ec ON ec.edge_log_id = el.id
     LEFT JOIN edge_result er ON er.edge_log_id = el.id
     GROUP BY week_start
     ORDER BY week_start ASC`,
  );

  res.json({
    overview: {
      totalFlagged: Number(overview.total),
      dateRange: { earliest: overview.earliest, latest: overview.latest },
    },
    closingLineValue: withWarning({
      n: Number(clv.n),
      avgClvPoints: clv.avg_clv === null ? null : Number(clv.avg_clv),
      pctMovedTowardFlag: clv.pct_moved === null ? null : Number(clv.pct_moved),
    }),
    hitRate: withWarning({
      n: Number(hit.n),
      actual: hit.hit_rate === null ? null : Number(hit.hit_rate),
      expectedBreakeven: hit.expected_breakeven === null ? null : Number(hit.expected_breakeven),
      expectedFairProbability: hit.expected_fair === null ? null : Number(hit.expected_fair),
    }),
    byStatType: byStatType.map((r) =>
      withWarning({
        statType: r.stat_type,
        n: Number(r.n),
        avgEdge: Number(r.avg_edge),
        closedN: Number(r.closed_n),
        avgClvPoints: r.avg_clv === null ? null : Number(r.avg_clv),
        settledN: Number(r.settled_n),
        hitRate: r.hit_rate === null ? null : Number(r.hit_rate),
      }),
    ),
    byEdgeBand: byEdgeBand.map((r) =>
      withWarning({
        band: r.band,
        n: Number(r.n),
        closedN: Number(r.closed_n),
        avgClvPoints: r.avg_clv === null ? null : Number(r.avg_clv),
        settledN: Number(r.settled_n),
        hitRate: r.hit_rate === null ? null : Number(r.hit_rate),
      }),
    ),
    // Every week is included, wins and losses alike — never filtered to flatter
    // the headline. See spec: "Show losing periods."
    byWeek: byWeek.map((r) =>
      withWarning({
        weekStart: r.week_start,
        n: Number(r.n),
        closedN: Number(r.closed_n),
        avgClvPoints: r.avg_clv === null ? null : Number(r.avg_clv),
        settledN: Number(r.settled_n),
        hitRate: r.hit_rate === null ? null : Number(r.hit_rate),
      }),
    ),
    sampleSizeWarningThreshold: SAMPLE_SIZE_WARNING_THRESHOLD,
  });
});
