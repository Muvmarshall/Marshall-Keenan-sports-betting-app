import { Link } from 'react-router-dom';

export function Footer() {
  return (
    <div className="px-4 py-4 text-center">
      <nav className="mb-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px]">
        <Link to="/verify" className="text-ink-faint underline hover:text-ink-dim">
          Verify the math
        </Link>
        <span className="text-ink-faint">·</span>
        <Link to="/results" className="text-ink-faint underline hover:text-ink-dim">
          Track record
        </Link>
        <span className="text-ink-faint">·</span>
        <Link to="/terms" className="text-ink-faint underline hover:text-ink-dim">
          Terms
        </Link>
        <span className="text-ink-faint">·</span>
        <Link to="/privacy" className="text-ink-faint underline hover:text-ink-dim">
          Privacy
        </Link>
      </nav>
      <p className="text-[11px] leading-relaxed text-ink-faint">
        For research. 21+. If gambling is causing harm, call 1-800-GAMBLER.
      </p>
    </div>
  );
}
