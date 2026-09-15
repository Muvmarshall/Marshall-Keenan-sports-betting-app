import React, { createContext, useContext, useEffect, useState } from 'react';

interface HealthResponse {
  ok: boolean;
  poller: { lastRunAt: string | null; lastRunOk: boolean; pollIntervalMs: number };
}

interface FeedStatusValue {
  /** False only on an explicit failure signal (health unreachable, or the poller's
   *  own last run errored) — never derived from a hardcoded staleness clock, since
   *  a live deployment on a free key might legitimately poll every 6 hours. */
  reachable: boolean;
  lastRunAt: string | null;
  checked: boolean;
}

const FeedStatusContext = createContext<FeedStatusValue>({ reachable: true, lastRunAt: null, checked: false });

const POLL_MS = 30_000;

export function FeedStatusProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<FeedStatusValue>({ reachable: true, lastRunAt: null, checked: false });

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const res = await fetch('/api/health');
        if (!res.ok) throw new Error(`status ${res.status}`);
        const body: HealthResponse = await res.json();
        if (cancelled) return;
        setStatus({ reachable: body.ok && body.poller.lastRunOk, lastRunAt: body.poller.lastRunAt, checked: true });
      } catch {
        if (!cancelled) setStatus((prev) => ({ ...prev, reachable: false, checked: true }));
      }
    };

    check();
    const id = setInterval(check, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return <FeedStatusContext.Provider value={status}>{children}</FeedStatusContext.Provider>;
}

export function useFeedStatus(): FeedStatusValue {
  return useContext(FeedStatusContext);
}
