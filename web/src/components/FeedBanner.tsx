import { useFeedStatus } from '../context/FeedStatusContext.js';

/** Persistent, non-dismissible — shown for as long as the feed is actually down. */
export function FeedBanner() {
  const { reachable, checked } = useFeedStatus();
  if (!checked || reachable) return null;

  return (
    <div className="sticky top-0 z-40 bg-caution-bg px-4 py-2 text-center text-[13px] font-medium text-caution">
      Odds feed unreachable. No edge values are shown until it recovers.
    </div>
  );
}
