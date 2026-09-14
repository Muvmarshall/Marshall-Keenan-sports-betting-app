import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  computeSlipRollup,
  detectCorrelations,
  type CorrelationFlag,
  type SlipLegInput,
  type SlipRollup,
} from '@parlay/shared';

export type SlipMode = 'edge' | 'lottery';

const EDGE_LEG_CAP = 4;
const STORAGE_KEY = 'parlay.slips.v1';

interface StoredSlips {
  edge: SlipLegInput[];
  lottery: SlipLegInput[];
}

function loadStored(): StoredSlips {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { edge: [], lottery: [] };
    const parsed = JSON.parse(raw);
    return { edge: parsed.edge ?? [], lottery: parsed.lottery ?? [] };
  } catch {
    return { edge: [], lottery: [] };
  }
}

export interface AddLegResult {
  ok: boolean;
  reason?: string;
}

interface SlipContextValue {
  mode: SlipMode;
  setMode: (m: SlipMode) => void;
  legs: SlipLegInput[];
  addLeg: (leg: SlipLegInput) => AddLegResult;
  removeLeg: (id: string) => void;
  clear: () => void;
  isInSlip: (id: string) => boolean;
  rollup: SlipRollup | null;
  correlations: CorrelationFlag[];
}

const SlipContext = createContext<SlipContextValue | null>(null);

export function SlipProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<SlipMode>('lottery');
  const [store, setStore] = useState<StoredSlips>(() => loadStored());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch {
      // best-effort — a private window or blocked storage just means it won't persist
    }
  }, [store]);

  const legs = store[mode];

  const addLeg = useCallback(
    (leg: SlipLegInput): AddLegResult => {
      let result: AddLegResult = { ok: true };
      setStore((prev) => {
        const current = prev[mode];
        if (current.some((l) => l.id === leg.id)) {
          result = { ok: false, reason: 'Already on this slip.' };
          return prev;
        }
        if (mode === 'edge') {
          if (leg.fairProbability - 1 / leg.multiplier <= 0) {
            result = { ok: false, reason: 'Edge mode only takes positive-EV selections. Switch to Lottery to add it anyway.' };
            return prev;
          }
          if (current.length >= EDGE_LEG_CAP) {
            result = { ok: false, reason: `Edge mode caps at ${EDGE_LEG_CAP} legs.` };
            return prev;
          }
        }
        return { ...prev, [mode]: [...current, leg] };
      });
      return result;
    },
    [mode],
  );

  const removeLeg = useCallback(
    (id: string) => {
      setStore((prev) => ({ ...prev, [mode]: prev[mode].filter((l) => l.id !== id) }));
    },
    [mode],
  );

  const clear = useCallback(() => {
    setStore((prev) => ({ ...prev, [mode]: [] }));
  }, [mode]);

  const isInSlip = useCallback((id: string) => legs.some((l) => l.id === id), [legs]);

  const rollup = useMemo(() => computeSlipRollup(legs), [legs]);
  const correlations = useMemo(() => detectCorrelations(legs), [legs]);

  const value: SlipContextValue = { mode, setMode, legs, addLeg, removeLeg, clear, isInSlip, rollup, correlations };

  return <SlipContext.Provider value={value}>{children}</SlipContext.Provider>;
}

export function useSlip(): SlipContextValue {
  const ctx = useContext(SlipContext);
  if (!ctx) throw new Error('useSlip must be used within SlipProvider');
  return ctx;
}

export { EDGE_LEG_CAP };
