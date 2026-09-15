import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchVerifyFair, type VerifyFairResult } from '../lib/api.js';
import { EdgePill } from '../components/EdgePill.js';

const PRESETS = [
  { label: '−110 / −110, 2.00x', over: -110, under: -110, multiplier: 2.0 },
  { label: '−130 / +110, 2.00x', over: -130, under: 110, multiplier: 2.0 },
  { label: '−200 / +165, 2.00x', over: -200, under: 165, multiplier: 2.0 },
  { label: '+120 / −140, 1.80x', over: 120, under: -140, multiplier: 1.8 },
];

export function VerifyPage() {
  const navigate = useNavigate();
  const [over, setOver] = useState('-110');
  const [under, setUnder] = useState('-110');
  const [multiplier, setMultiplier] = useState('2.00');
  const [result, setResult] = useState<VerifyFairResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async (o = Number(over), u = Number(under), m = Number(multiplier)) => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetchVerifyFair(o, u, m);
      setResult(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const runPreset = (p: (typeof PRESETS)[number]) => {
    setOver(String(p.over));
    setUnder(String(p.under));
    setMultiplier(String(p.multiplier));
    run(p.over, p.under, p.multiplier);
  };

  return (
    <div>
      <div className="flex items-center gap-3 px-4 pb-[13px] pt-[15px]">
        <button onClick={() => navigate(-1)} className="font-cond text-lg text-ink-dim hover:text-ink" aria-label="Back">
          ←
        </button>
        <h1 className="font-cond text-[23px] font-semibold tracking-tight text-ink">Verify the math</h1>
      </div>

      <div className="px-[18px] pb-6">
        <p className="mb-4 text-[15px] leading-relaxed text-ink-dim">
          Every edge in this product comes from the same three steps: convert prices to probabilities, remove the
          vig, compare to what the multiplier requires. This calculator runs those steps against the same endpoint
          the app itself calls — nothing here is dressed up for display.{' '}
          <a href="/api/verify/fair?over=-110&under=-110&multiplier=2.00" className="underline hover:text-ink">
            View the raw JSON
          </a>
          .
        </p>

        <div className="mb-4 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => runPreset(p)}
              className="tabular rounded-[7px] border border-rule px-3 py-2 font-cond text-sm font-medium text-ink-dim hover:border-ink-dim hover:text-ink"
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="mb-4 rounded-card bg-surface px-4 py-[15px]">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Over" value={over} onChange={setOver} />
            <Field label="Under" value={under} onChange={setUnder} />
            <Field label="Multiplier" value={multiplier} onChange={setMultiplier} />
          </div>
          <p className="mt-2 text-[11px] text-ink-faint">
            American (e.g. −110, +120) or decimal (e.g. 1.9091) — either works, auto-detected.
          </p>
          <button
            onClick={() => run()}
            disabled={loading}
            className="mt-3 w-full rounded-[9px] bg-signal py-3 text-center font-cond text-[17px] font-semibold text-[#06182B] disabled:opacity-60"
          >
            {loading ? 'Calculating…' : 'Calculate'}
          </button>
        </div>

        {error && <p className="mb-4 rounded-card bg-caution-bg px-4 py-3 text-[13px] text-caution">{error}</p>}

        {result && <ResultBreakdown result={result} />}
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-[11px] text-ink-faint">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="tabular mt-1 w-full rounded-[6px] border border-rule bg-raised px-2 py-2 font-cond text-base text-ink outline-none focus:border-signal"
      />
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-rule py-2 last:border-0">
      <span className="text-[13px] text-ink-dim">{label}</span>
      <span className="tabular font-cond text-base font-medium text-ink">{value}</span>
    </div>
  );
}

function ResultBreakdown({ result }: { result: VerifyFairResult }) {
  return (
    <div className="rounded-card bg-surface px-4 py-[15px]">
      <div className="mb-3 flex items-center justify-between border-b border-rule pb-3">
        <span className="text-[13px] text-ink-dim">edge</span>
        <EdgePill edge={result.edge} label={result.label} />
      </div>
      <Row label="1. Decimal odds (over / under)" value={`${result.decimal.over} / ${result.decimal.under}`} />
      <Row
        label="2. Raw implied probability"
        value={`${(result.rawImplied.over * 100).toFixed(2)}% / ${(result.rawImplied.under * 100).toFixed(2)}%`}
      />
      <Row label="3. Overround (the vig)" value={result.overround.toFixed(4)} />
      <Row
        label="4. Fair probability (vig removed)"
        value={`${(result.fair.over * 100).toFixed(2)}% / ${(result.fair.under * 100).toFixed(2)}%`}
      />
      <Row label="5. Breakeven needed (1 / multiplier)" value={`${(result.breakeven * 100).toFixed(2)}%`} />
      <Row label="6. Edge (fair − breakeven, over side)" value={`${result.edge >= 0 ? '+' : ''}${(result.edge * 100).toFixed(2)}%`} />
    </div>
  );
}
