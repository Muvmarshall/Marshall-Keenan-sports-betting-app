import { useState } from 'react';
import { EDGE_LEG_CAP, useSlip, type SlipMode } from '../context/SlipContext.js';
import { getClientId } from '../lib/clientId.js';
import { postSlip } from '../lib/api.js';

const MODES: { id: SlipMode; label: string }[] = [
  { id: 'edge', label: 'Edge' },
  { id: 'lottery', label: 'Lottery' },
];

export function SlipTab() {
  const { mode, setMode, legs, removeLeg, rollup, correlations } = useSlip();
  const [saved, setSaved] = useState(false);

  const weakestIds = new Set(rollup?.weakestLegs.map((l) => l.id) ?? []);

  const handleSwap = () => {
    for (const id of weakestIds) removeLeg(id);
  };

  const handleSave = async () => {
    if (!rollup) return;
    try {
      await postSlip({
        clientId: getClientId(),
        mode,
        legs: legs.map((l) => ({
          propId: Number(l.id.replace('prop:', '')),
          side: l.side,
          multiplierAtAdd: l.multiplier,
          edgeAtAdd: l.fairProbability - 1 / l.multiplier,
        })),
        combinedMultiplier: rollup.combinedMultiplier,
        estProbability: rollup.estHitRate,
        estEv: rollup.expectedValue,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      // best-effort — the slip still works entirely from local state without this
    }
  };

  return (
    <div>
      <div className="mb-4 flex gap-[7px]">
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={`flex-1 rounded-[7px] border py-2 text-center font-cond text-[15px] font-medium ${
              mode === m.id ? 'border-signal bg-signal-bg text-signal' : 'border-rule text-ink-faint'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      {mode === 'edge' && (
        <p className="mb-3 text-[13px] text-ink-dim">
          Edge mode only takes positive-EV selections, capped at {EDGE_LEG_CAP} legs.
        </p>
      )}

      {legs.length === 0 ? (
        <p className="rounded-card bg-surface px-4 py-6 text-center text-sm text-ink-dim">Add a leg to see your edge.</p>
      ) : (
        <>
          <div className="mb-1">
            {legs.map((leg) => {
              const edge = leg.fairProbability - 1 / leg.multiplier;
              const positive = edge > 0;
              return (
                <div key={leg.id} className="flex items-center justify-between border-b border-rule py-[11px]">
                  <div>
                    <div className="font-cond text-[17px] font-medium text-ink">{leg.playerName}</div>
                    <div className="text-[11px] text-ink-faint">
                      {leg.statLabel} {leg.side} {leg.line} · {leg.multiplier.toFixed(2)}x
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`tabular font-cond text-base font-semibold ${positive ? 'text-signal' : 'text-caution'}`}>
                      {positive ? '+' : ''}
                      {(edge * 100).toFixed(1)}
                    </span>
                    <button onClick={() => removeLeg(leg.id)} className="text-ink-faint hover:text-ink" aria-label={`Remove ${leg.playerName}`}>
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {correlations.length > 0 && (
            <div className="mt-3 space-y-2">
              {correlations.map((flag, i) => (
                <div key={i} className="rounded-card border-l-2 border-caution bg-surface px-3 py-2 text-[13px] leading-relaxed text-ink-dim">
                  {flag.reason}
                </div>
              ))}
            </div>
          )}

          {rollup && (
            <div className="mt-[14px] rounded-card bg-surface px-4 py-[15px]">
              <div className="flex items-baseline justify-between border-b border-rule pb-3">
                <span
                  className={`tabular font-cond text-[33px] font-semibold leading-none ${
                    rollup.expectedValue >= 0 ? 'text-signal' : 'text-caution'
                  }`}
                >
                  {rollup.expectedValue >= 0 ? '+' : ''}
                  {(rollup.expectedValue * 100).toFixed(1)}%
                </span>
                <span className="text-xs text-ink-dim">expected value</span>
              </div>

              <div className="grid grid-cols-2 gap-[11px] py-3">
                <Stat label="combined payout" value={`${rollup.combinedMultiplier.toFixed(1)}x`} />
                <Stat label="estimated hit rate" value={`${(rollup.estHitRate * 100).toFixed(1)}%`} />
                <Stat label="breakeven needed" value={`${(rollup.breakevenNeeded * 100).toFixed(1)}%`} />
                <Stat label="legs positive" value={`${rollup.legsPositive} of ${rollup.legCount}`} />
              </div>

              {rollup.weakestLegs.length > 0 && rollup.evWithoutWeakestLegs !== null && (
                <p className="border-t border-rule pt-[11px] text-[13px] leading-relaxed text-ink-dim">
                  {rollup.weakestLegs.length === 1 ? 'One leg is' : 'Two legs are'} pulling this under:{' '}
                  <b className="font-medium text-caution">{rollup.weakestLegs.map((l) => l.playerName).join(' and ')}</b>. Drop{' '}
                  {rollup.weakestLegs.length === 1 ? 'it' : 'them'} and expected value moves to{' '}
                  <b className="font-medium text-caution">
                    {rollup.evWithoutWeakestLegs >= 0 ? '+' : ''}
                    {(rollup.evWithoutWeakestLegs * 100).toFixed(1)}%
                  </b>
                  .
                </p>
              )}

              {rollup.weakestLegs.length > 0 && (
                <button onClick={handleSwap} className="mt-[14px] block w-full rounded-[9px] bg-signal py-3 text-center font-cond text-[17px] font-semibold text-[#06182B]">
                  Swap the {rollup.weakestLegs.length === 1 ? 'weak leg' : 'two weak legs'}
                </button>
              )}
            </div>
          )}

          <button onClick={handleSave} className="mt-3 w-full rounded-[9px] border border-rule py-2 text-center font-cond text-sm font-medium text-ink-dim hover:border-ink-dim hover:text-ink">
            {saved ? 'Saved' : 'Save this slip'}
          </button>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="tabular font-cond text-[19px] font-semibold text-ink">{value}</div>
      <div className="text-[11px] text-ink-faint">{label}</div>
    </div>
  );
}
