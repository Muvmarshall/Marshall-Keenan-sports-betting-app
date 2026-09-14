import { useEffect, useState } from 'react';

const NOTICE_AFTER_MS = 45 * 60 * 1000;

/** A quiet, dismissible, non-blocking notice after 45 minutes of continuous use. */
export function UsageNotice() {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), NOTICE_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!visible || dismissed) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom,0px)+12px)]">
      <div className="flex w-full max-w-md items-center justify-between gap-3 rounded-card border border-rule bg-raised px-4 py-3 shadow-lg">
        <p className="text-[13px] leading-snug text-ink-dim">You've been at this a while. The slate will still be here later.</p>
        <button
          onClick={() => setDismissed(true)}
          className="shrink-0 font-cond text-sm font-medium text-ink-dim hover:text-ink"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
