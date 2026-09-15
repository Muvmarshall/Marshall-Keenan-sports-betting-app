import { pool } from '../db/pool.js';

export interface DailyDigestStats {
  date: string; // YYYY-MM-DD
  flagged: number;
  closed: number;
  settled: number;
  avgClvPoints: number | null;
  pctMovedTowardFlag: number | null;
  hitRate: number | null;
}

/** Aggregates edge_log/edge_close/edge_result for one UTC calendar day. */
export async function computeDailyDigestStats(dateIso: string): Promise<DailyDigestStats> {
  const { rows } = await pool.query<{
    flagged: string;
    closed: string;
    settled: string;
    avg_clv: string | null;
    pct_moved: string | null;
    hit_rate: string | null;
  }>(
    `SELECT
       COUNT(*)::text AS flagged,
       COUNT(ec.edge_log_id)::text AS closed,
       COUNT(er.edge_log_id)::text AS settled,
       AVG(ec.clv_points) AS avg_clv,
       -- The nested CASE (no ELSE on the outer) yields NULL for unclosed/unsettled
       -- rows, which AVG ignores — a flat CASE...ELSE 0.0 would wrongly count
       -- every not-yet-closed flag as "didn't move," diluting the average.
       AVG(CASE WHEN ec.edge_log_id IS NOT NULL THEN (CASE WHEN ec.line_moved_toward_flag THEN 1.0 ELSE 0.0 END) END) AS pct_moved,
       AVG(CASE WHEN er.edge_log_id IS NOT NULL THEN (CASE WHEN er.hit THEN 1.0 ELSE 0.0 END) END) AS hit_rate
     FROM edge_log el
     LEFT JOIN edge_close ec ON ec.edge_log_id = el.id
     LEFT JOIN edge_result er ON er.edge_log_id = el.id
     WHERE el.observed_at::date = $1::date`,
    [dateIso],
  );
  const r = rows[0];
  return {
    date: dateIso,
    flagged: Number(r.flagged),
    closed: Number(r.closed),
    settled: Number(r.settled),
    avgClvPoints: r.avg_clv === null ? null : Number(r.avg_clv),
    pctMovedTowardFlag: r.pct_moved === null ? null : Number(r.pct_moved),
    hitRate: r.hit_rate === null ? null : Number(r.hit_rate),
  };
}

export function renderDigestText(stats: DailyDigestStats): string {
  const fmt = (x: number | null, digits = 2) => (x === null ? 'n/a' : x.toFixed(digits));
  return [
    `Project Parlay — daily grading digest for ${stats.date}`,
    '',
    `Edges flagged:        ${stats.flagged}`,
    `Closed (graded vs. closing line): ${stats.closed}`,
    `Settled (real outcome known):     ${stats.settled}`,
    '',
    `Avg closing-line value: ${stats.avgClvPoints === null ? 'n/a' : `${fmt(stats.avgClvPoints * 100)} points`}`,
    `Market moved toward flag: ${stats.pctMovedTowardFlag === null ? 'n/a' : `${fmt(stats.pctMovedTowardFlag * 100, 1)}%`}`,
    `Hit rate: ${stats.hitRate === null ? 'n/a' : `${fmt(stats.hitRate * 100, 1)}%`}`,
    '',
    stats.closed < 100 || stats.settled < 100
      ? 'Sample size is under 100 for at least one figure above — treat as noise, not signal.'
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export interface DigestSender {
  send(subject: string, body: string): Promise<void>;
}

/**
 * No email provider is configured in this build (no SMTP/API credentials
 * available) — this logs the digest as structured output instead of silently
 * doing nothing. Swap in a real sender (Resend, SES, SendGrid) by implementing
 * this same interface; nothing else needs to change. See README "Operations".
 */
export class ConsoleDigestSender implements DigestSender {
  async send(subject: string, body: string): Promise<void> {
    console.log(JSON.stringify({ event: 'daily_digest', subject, body }));
  }
}

let sender: DigestSender = new ConsoleDigestSender();
export function setDigestSender(s: DigestSender): void {
  sender = s;
}

/** Computes and sends yesterday's (UTC) digest. */
export async function runDailyDigest(referenceDate = new Date()): Promise<void> {
  const yesterday = new Date(referenceDate);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const dateIso = yesterday.toISOString().slice(0, 10);

  const stats = await computeDailyDigestStats(dateIso);
  const body = renderDigestText(stats);
  await sender.send(`Project Parlay digest — ${dateIso}`, body);
}

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly check, cheap and DST-safe
const DIGEST_HOUR_UTC = 13; // ~9am ET

/** Runs runDailyDigest once per UTC calendar day, near DIGEST_HOUR_UTC. */
export function startDailyDigestScheduler(): NodeJS.Timeout {
  let lastSentDateIso: string | null = null;

  const check = async () => {
    const now = new Date();
    const todayIso = now.toISOString().slice(0, 10);
    if (now.getUTCHours() !== DIGEST_HOUR_UTC || lastSentDateIso === todayIso) return;
    lastSentDateIso = todayIso;
    await runDailyDigest(now).catch((err) => console.error('daily digest failed:', err));
  };

  return setInterval(() => check().catch((err) => console.error('daily digest check failed:', err)), CHECK_INTERVAL_MS);
}
