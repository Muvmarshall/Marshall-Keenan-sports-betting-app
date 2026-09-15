import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Cell } from 'recharts';
import { fetchResults, type ResultsResponse } from '../lib/results.js';

const WEEK_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const STAT_LABELS: Record<string, string> = {
  pass_yds: 'Passing yards',
  rush_yds: 'Rushing yards',
  rec_yds: 'Receiving yards',
  receptions: 'Receptions',
  pass_tds: 'Passing touchdowns',
  rush_tds: 'Rushing touchdowns',
  rec_tds: 'Receiving touchdowns',
};

export function ResultsPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<ResultsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchResults()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load results'));
  }, []);

  return (
    <div>
      <div className="flex items-center gap-3 px-4 pb-[13px] pt-[15px]">
        <button onClick={() => navigate(-1)} className="font-cond text-lg text-ink-dim hover:text-ink" aria-label="Back">
          ←
        </button>
        <h1 className="font-cond text-[23px] font-semibold tracking-tight text-ink">Track record</h1>
      </div>

      <div className="px-[18px] pb-6">
        <p className="mb-4 text-[15px] leading-relaxed text-ink-dim">
          Every flagged edge is logged automatically when it crosses 1%, graded against the closing line at kickoff,
          and settled against the real outcome. No row here is hand-entered. Losing stretches are shown, not
          filtered out.
        </p>

        {error && <p className="rounded-card bg-caution-bg px-4 py-3 text-[13px] text-caution">{error}</p>}
        {!data && !error && <p className="text-sm text-ink-dim">Loading track record…</p>}

        {data && data.overview.totalFlagged === 0 && (
          <p className="rounded-card bg-surface px-4 py-6 text-center text-sm text-ink-dim">
            No edges flagged yet. This page fills in automatically once the poller has been running against posted
            props — nothing to show is the honest state, not an error.
          </p>
        )}

        {data && data.overview.totalFlagged > 0 && <ResultsBody data={data} />}
      </div>
    </div>
  );
}

function ResultsBody({ data }: { data: ResultsResponse }) {
  const { overview, closingLineValue, hitRate } = data;

  return (
    <div>
      <p className="mb-3 text-[11px] text-ink-faint">
        {overview.totalFlagged} edges flagged
        {overview.dateRange.earliest && overview.dateRange.latest && (
          <>
            {' '}
            · {WEEK_FORMAT.format(new Date(overview.dateRange.earliest))} –{' '}
            {WEEK_FORMAT.format(new Date(overview.dateRange.latest))}
          </>
        )}
      </p>

      <div className="mb-4 rounded-card bg-surface px-4 py-[15px]">
        <div className="flex items-baseline justify-between border-b border-rule pb-3">
          <span
            className={`tabular font-cond text-[33px] font-semibold leading-none ${
              closingLineValue.avgClvPoints !== null && closingLineValue.avgClvPoints >= 0 ? 'text-signal' : 'text-caution'
            }`}
          >
            {closingLineValue.avgClvPoints === null
              ? '—'
              : `${closingLineValue.avgClvPoints >= 0 ? '+' : ''}${(closingLineValue.avgClvPoints * 100).toFixed(2)}`}
          </span>
          <span className="text-xs text-ink-dim">avg closing-line value (points)</span>
        </div>
        {closingLineValue.sampleSizeWarning && <SampleWarning n={closingLineValue.n} />}
        <div className="grid grid-cols-2 gap-[11px] pt-3">
          <Stat
            label="market moved toward flag"
            value={closingLineValue.pctMovedTowardFlag === null ? '—' : `${(closingLineValue.pctMovedTowardFlag * 100).toFixed(1)}%`}
          />
          <Stat label="closed flags" value={String(closingLineValue.n)} />
        </div>
      </div>

      <div className="mb-4 rounded-card bg-surface px-4 py-[15px]">
        <div className="mb-2 text-xs text-ink-dim">hit rate vs. expected</div>
        {hitRate.sampleSizeWarning && <SampleWarning n={hitRate.n} />}
        <div className="grid grid-cols-3 gap-[11px]">
          <Stat label="actual" value={hitRate.actual === null ? '—' : `${(hitRate.actual * 100).toFixed(1)}%`} />
          <Stat
            label="breakeven needed"
            value={hitRate.expectedBreakeven === null ? '—' : `${(hitRate.expectedBreakeven * 100).toFixed(1)}%`}
          />
          <Stat
            label="our fair estimate"
            value={hitRate.expectedFairProbability === null ? '—' : `${(hitRate.expectedFairProbability * 100).toFixed(1)}%`}
          />
        </div>
      </div>

      {data.byWeek.length > 0 && (
        <div className="mb-4 rounded-card bg-surface px-4 py-[15px]">
          <div className="mb-2 text-xs text-ink-dim">closing-line value by week</div>
          <div className="h-[140px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.byWeek.map((w) => ({ ...w, weekLabel: WEEK_FORMAT.format(new Date(w.weekStart)) }))}>
                <CartesianGrid stroke="#33414E" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="weekLabel" tick={{ fill: '#5C6C7C', fontSize: 10 }} stroke="#33414E" />
                <YAxis tick={{ fill: '#5C6C7C', fontSize: 10 }} stroke="#33414E" tickFormatter={(v) => `${(v * 100).toFixed(0)}`} />
                <ReferenceLine y={0} stroke="#33414E" />
                <Tooltip
                  contentStyle={{ background: '#1E2831', border: '1px solid #33414E', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number, _n, item: any) => [
                    `${(v * 100).toFixed(2)} pts (n=${item.payload.n}${item.payload.sampleSizeWarning ? ', small sample' : ''})`,
                    'avg CLV',
                  ]}
                />
                <Bar dataKey="avgClvPoints">
                  {data.byWeek.map((w, i) => (
                    <Cell key={i} fill={(w.avgClvPoints ?? 0) >= 0 ? '#4DA3FF' : '#FFA23C'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {data.byStatType.length > 0 && (
        <BreakdownTable
          title="by stat type"
          rows={data.byStatType.map((r) => ({
            label: STAT_LABELS[r.statType] ?? r.statType,
            n: r.n,
            avgClvPoints: r.avgClvPoints,
            hitRate: r.hitRate,
            sampleSizeWarning: r.sampleSizeWarning,
          }))}
        />
      )}

      {data.byEdgeBand.length > 0 && (
        <BreakdownTable
          title="by edge size"
          rows={data.byEdgeBand.map((r) => ({
            label: r.band,
            n: r.n,
            avgClvPoints: r.avgClvPoints,
            hitRate: r.hitRate,
            sampleSizeWarning: r.sampleSizeWarning,
          }))}
        />
      )}
    </div>
  );
}

function SampleWarning({ n }: { n: number }) {
  return (
    <p className="mb-2 text-[11px] text-caution">
      Sample size is {n} — under 100, treat this figure as noise, not a track record.
    </p>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="tabular font-cond text-lg font-semibold text-ink">{value}</div>
      <div className="text-[11px] text-ink-faint">{label}</div>
    </div>
  );
}

function BreakdownTable({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; n: number; avgClvPoints: number | null; hitRate: number | null; sampleSizeWarning: boolean }[];
}) {
  return (
    <div className="mb-4 rounded-card bg-surface px-4 py-[15px]">
      <div className="mb-2 text-xs text-ink-dim">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between border-b border-rule py-2 last:border-0">
          <div>
            <div className="font-cond text-[15px] font-medium text-ink">{r.label}</div>
            <div className="text-[11px] text-ink-faint">
              n={r.n}
              {r.sampleSizeWarning && ' · small sample'}
            </div>
          </div>
          <div className="text-right">
            <div
              className={`tabular font-cond text-base font-semibold ${
                r.avgClvPoints !== null && r.avgClvPoints >= 0 ? 'text-signal' : r.avgClvPoints !== null ? 'text-caution' : 'text-ink-faint'
              }`}
            >
              {r.avgClvPoints === null ? '—' : `${r.avgClvPoints >= 0 ? '+' : ''}${(r.avgClvPoints * 100).toFixed(2)} pts`}
            </div>
            <div className="text-[11px] text-ink-faint">{r.hitRate === null ? 'ungraded' : `${(r.hitRate * 100).toFixed(1)}% hit`}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
