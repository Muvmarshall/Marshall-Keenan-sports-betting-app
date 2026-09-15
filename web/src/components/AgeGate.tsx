import { useEffect, useState } from 'react';

const KEY = 'parlay.ageGate.ack.v1';

function loadAck(): boolean {
  try {
    return localStorage.getItem(KEY) === 'true';
  } catch {
    return false;
  }
}

/** Blocking on first visit. Confirms 21+ and that this is research, not a sportsbook. */
export function AgeGate() {
  const [acknowledged, setAcknowledged] = useState(true); // default open (unblocked) until we know
  const [declined, setDeclined] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setAcknowledged(loadAck());
    setReady(true);
  }, []);

  if (!ready || acknowledged) return null;

  const confirm = () => {
    try {
      localStorage.setItem(KEY, 'true');
    } catch {
      // best-effort — if storage is blocked, this asks again next visit, which is safe
    }
    setAcknowledged(true);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ground/98 px-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-card bg-surface px-5 py-6">
        {!declined ? (
          <>
            <h1 className="mb-3 font-cond text-2xl font-semibold text-ink">Before you continue</h1>
            <p className="mb-2 text-[15px] leading-relaxed text-ink-dim">
              This is a research tool for evaluating player-prop pricing. It does not accept wagers, place bets, or
              connect to a sportsbook.
            </p>
            <p className="mb-5 text-[15px] leading-relaxed text-ink-dim">You must be 21 or older to continue.</p>
            <button
              onClick={confirm}
              className="mb-2 block w-full rounded-[9px] bg-signal py-3 text-center font-cond text-[17px] font-semibold text-[#06182B]"
            >
              I am 21 or older
            </button>
            <button
              onClick={() => setDeclined(true)}
              className="block w-full rounded-[9px] border border-rule py-3 text-center font-cond text-[15px] font-medium text-ink-dim"
            >
              I am under 21
            </button>
          </>
        ) : (
          <>
            <h1 className="mb-3 font-cond text-2xl font-semibold text-ink">This tool isn't for you yet</h1>
            <p className="text-[15px] leading-relaxed text-ink-dim">
              You need to be 21 or older to use this product. Come back when you are.
            </p>
          </>
        )}
        <p className="mt-5 border-t border-rule pt-4 text-[11px] leading-relaxed text-ink-faint">
          For research. 21+. If gambling is causing harm, call 1-800-GAMBLER.
        </p>
      </div>
    </div>
  );
}
