import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchGames, type GameSummary } from '../lib/api.js';
import { TabBar } from '../components/TabBar.js';

const SPORTS = ['NFL', 'NCAAF', 'NBA', 'MLB'] as const;
type Sport = (typeof SPORTS)[number];

const DAY_FORMAT = new Intl.DateTimeFormat('en-US', { weekday: 'long' });
const DATE_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const TIME_FORMAT = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function TodayPage() {
  const [sport, setSport] = useState<Sport>('NFL');
  const [games, setGames] = useState<GameSummary[]>([]);
  const [note, setNote] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const date = todayIso();
  const today = new Date();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchGames(sport, date)
      .then((res) => {
        if (cancelled) return;
        setGames(res.games);
        setNote(res.note);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [sport, date]);

  return (
    <div>
      <div className="flex items-center justify-between px-4 pb-[13px] pt-[15px]">
        <h1 className="font-cond text-[23px] font-semibold tracking-tight text-ink">{DAY_FORMAT.format(today)}</h1>
        <span className="tabular text-xs text-ink-dim">{DATE_FORMAT.format(today)}</span>
      </div>

      <TabBar tabs={SPORTS.map((s) => ({ id: s, label: s }))} active={sport} onChange={setSport} />

      <div className="px-[18px] pb-6 pt-4">
        {loading && <p className="text-sm text-ink-dim">Loading today's slate…</p>}
        {!loading && note && <p className="text-sm text-ink-dim">{note}</p>}
        {!loading && !note && games.length === 0 && (
          <p className="text-sm text-ink-dim">No games on today's slate.</p>
        )}
        {games.map((g) => (
          <button
            key={g.id}
            onClick={() => navigate(`/games/${g.id}`)}
            className={`mb-[10px] block w-full rounded-card bg-surface px-[15px] py-[14px] text-left ${
              g.linesPosted ? '' : 'opacity-55'
            }`}
          >
            <div className="flex items-baseline justify-between">
              <span className="font-cond text-xl font-semibold text-ink">
                {g.awayTeam} at {g.homeTeam}
              </span>
              <span className="tabular font-cond text-base text-ink-dim">
                {g.spread !== null ? `${g.homeTeam} ${g.spread > 0 ? '+' : ''}${g.spread}` : '—'}
              </span>
            </div>
            <div className="mt-[2px] flex items-baseline justify-between">
              <span className="text-xs text-ink-faint">
                {g.linesPosted ? TIME_FORMAT.format(new Date(g.kickoffUtc)) : sameDay(g.kickoffUtc, date) ? 'Later today' : 'Tomorrow'}
              </span>
              <span className="tabular font-cond text-base text-ink-dim">{g.total !== null ? `o/u ${g.total}` : ''}</span>
            </div>
            <div className="mt-[9px] flex gap-[14px] border-t border-rule pt-[9px]">
              {g.linesPosted ? (
                <>
                  <span className="text-xs text-ink-faint">
                    <b className="font-medium text-signal">{g.edgesFound}</b> edges found
                  </span>
                  <span className="text-xs text-ink-faint">
                    <b className="font-medium text-signal">{g.linesMoved}</b> lines moved
                  </span>
                </>
              ) : (
                <span className="text-xs text-ink-faint">Lines not posted</span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function sameDay(isoA: string, isoB: string): boolean {
  return isoA.slice(0, 10) === isoB;
}
