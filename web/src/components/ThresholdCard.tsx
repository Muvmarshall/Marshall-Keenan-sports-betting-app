import { useEffect, useState } from 'react';
import type { PlayerPropCard } from '../lib/api.js';
import { EdgePill } from './EdgePill.js';

interface ThresholdCardProps {
  playerName: string;
  position: string;
  team: string;
  prop: PlayerPropCard;
  inSlip: boolean;
  onAdd: () => void;
}

function barHeight(value: number, line: number, maxDiff: number): number {
  const diff = Math.abs(value - line);
  if (maxDiff === 0) return 8;
  return Math.round(4 + (diff / maxDiff) * 27);
}

/**
 * Counts the edge figure up to its value once, on first render. Respects reduced motion.
 * No "already started" guard: React 18 StrictMode's dev-mode mount→cleanup→mount would
 * make a guard ref skip the second mount's effect entirely (the first mount's cleanup
 * cancels the animation before it ever ticks), leaving the value stuck at 0.
 */
function useCountUp(target: number, durationMs = 600): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      setValue(target);
      return;
    }
    const start = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      setValue(target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    // Backstop for environments that throttle rAF on an inactive/background tab —
    // the figure must still land on the real value once the duration has passed.
    const settle = setTimeout(() => setValue(target), durationMs + 50);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(settle);
    };
  }, [target, durationMs]);

  return value;
}

export function ThresholdCard({ playerName, position, team, prop, inSlip, onAdd }: ThresholdCardProps) {
  const { line, last5, edge } = prop;
  const primary = edge.primary;
  const maxDiff = Math.max(1, ...last5.map((v) => Math.abs(v - line)));
  const animatedEdge = useCountUp(primary ? primary.edge : 0);

  return (
    <div className="mb-[11px] rounded-card bg-surface px-4 py-[15px]">
      <div className="mb-[3px] flex items-baseline justify-between">
        <span className="font-cond text-xl font-semibold text-ink">{playerName}</span>
        <span className="text-xs text-ink-dim">
          {position} · {team}
        </span>
      </div>
      <div className="text-xs text-ink-dim">{prop.statLabel} · last 5</div>

      <div className="relative my-[13px] h-[62px]">
        <div className="absolute left-0 right-0 top-[31px] h-px bg-rule" />
        <div className="tabular absolute left-0 top-[23px] z-[2] bg-surface pr-2 font-cond text-[15px] font-medium text-ink-dim">
          {line}
        </div>
        <div className="absolute bottom-0 left-[52px] right-0 top-0 flex items-center gap-[7px]">
          {last5.map((v, i) => {
            const up = v > line;
            const h = barHeight(v, line, maxDiff);
            return (
              <div key={i} className="relative h-[62px] flex-1">
                <div
                  className={`tabular absolute left-0 right-0 rounded-[2px] text-center font-cond text-xs font-medium leading-none ${
                    up ? 'bottom-[31px] bg-signal pt-[2px] text-[#06182B]' : 'top-[31px] flex items-end justify-center bg-[#2C3945] pb-[2px] text-ink-dim'
                  }`}
                  style={{ height: `${h}px` }}
                >
                  {v}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-rule pt-[11px]">
        <div className="flex gap-4">
          {primary && (
            <>
              <div>
                <div className="tabular font-cond text-[17px] font-semibold leading-tight text-ink">{primary.multiplier.toFixed(2)}x</div>
                <div className="text-[11px] text-ink-faint">needs {(primary.breakeven * 100).toFixed(1)}%</div>
              </div>
              <div>
                <div className="tabular font-cond text-[17px] font-semibold leading-tight text-ink">{(primary.fairProbability * 100).toFixed(1)}%</div>
                <div className="text-[11px] text-ink-faint">fair estimate</div>
              </div>
            </>
          )}
        </div>
        {primary && <EdgePill edge={animatedEdge} label={primary.label} />}
      </div>

      <button
        onClick={onAdd}
        disabled={inSlip}
        className="mt-3 w-full rounded-[9px] border border-rule py-2 text-center font-cond text-sm font-medium text-ink-dim disabled:cursor-default disabled:border-signal disabled:bg-signal-bg disabled:text-signal enabled:hover:border-ink-dim enabled:hover:text-ink"
      >
        {inSlip ? 'On your slip' : 'Add to slip'}
      </button>
    </div>
  );
}
