import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { fetchMovement, type MovementMarket } from '../lib/api.js';

const TIME_FORMAT = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });

export function MovementTab({ gameId }: { gameId: number }) {
  const [markets, setMarkets] = useState<MovementMarket[] | null>(null);

  useEffect(() => {
    fetchMovement(gameId).then((res) => setMarkets(res.markets));
  }, [gameId]);

  if (!markets) return <p className="text-sm text-ink-dim">Loading line movement…</p>;
  if (markets.length === 0) return <p className="text-sm text-ink-dim">Lines not posted yet for this game.</p>;

  return (
    <div>
      {markets.map((m) => (
        <MarketCard key={`${m.playerId}:${m.statType}`} market={m} />
      ))}
    </div>
  );
}

function MarketCard({ market }: { market: MovementMarket }) {
  const chartData = market.priceHistory.platform.map((p) => ({
    at: new Date(p.at).getTime(),
    multiplier: p.multiplier,
  }));
  const delta = market.currentLine - market.openLine;

  return (
    <div className="mb-3 rounded-card bg-surface px-4 py-[15px]">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="font-cond text-xl font-semibold text-ink">{market.playerName}</span>
        <span className="text-xs text-ink-dim">{market.team}</span>
      </div>
      <div className="mb-2 text-xs text-ink-dim">{market.statLabel}</div>

      {market.steamFlags.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {market.steamFlags.map((flag, i) => (
            <span key={i} className="rounded-md bg-caution-bg px-2 py-1 text-[11px] font-medium text-caution">
              Steam: {flag.booksMoved} books moved {flag.direction} · {TIME_FORMAT.format(new Date(flag.from))}–{TIME_FORMAT.format(new Date(flag.to))}
            </span>
          ))}
        </div>
      )}

      <div className="mb-2 flex items-baseline gap-4">
        <div>
          <div className="tabular font-cond text-lg font-semibold text-ink">
            {market.openLine} <span className="text-ink-faint">→</span> {market.currentLine}
          </div>
          <div className="text-[11px] text-ink-faint">open vs current line</div>
        </div>
        {delta !== 0 && (
          <span className={`tabular font-cond text-sm font-medium ${delta > 0 ? 'text-signal' : 'text-caution'}`}>
            {delta > 0 ? '+' : ''}
            {delta}
          </span>
        )}
      </div>

      {chartData.length > 1 && (
        <div className="h-[120px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
              <CartesianGrid stroke="#33414E" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="at"
                type="number"
                domain={['dataMin', 'dataMax']}
                tickFormatter={(v) => TIME_FORMAT.format(new Date(v))}
                tick={{ fill: '#5C6C7C', fontSize: 10 }}
                stroke="#33414E"
              />
              <YAxis tick={{ fill: '#5C6C7C', fontSize: 10 }} stroke="#33414E" domain={['auto', 'auto']} />
              <Tooltip
                contentStyle={{ background: '#1E2831', border: '1px solid #33414E', borderRadius: 8, fontSize: 12 }}
                labelFormatter={(v) => TIME_FORMAT.format(new Date(v as number))}
                formatter={(v: number) => [`${v.toFixed(2)}x`, 'Platform multiplier']}
              />
              <Line type="stepAfter" dataKey="multiplier" stroke="#4DA3FF" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <p className="mt-2 border-t border-rule pt-2 text-[13px] leading-relaxed text-ink-dim">{market.summary}</p>
    </div>
  );
}
