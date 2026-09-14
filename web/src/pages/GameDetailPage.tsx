import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchMatchup, type MatchupResponse } from '../lib/api.js';
import { TabBar } from '../components/TabBar.js';
import { MatchupTab } from './MatchupTab.js';
import { PlayersTab } from './PlayersTab.js';
import { MovementTab } from './MovementTab.js';
import { SlipTab } from './SlipTab.js';

const TABS = [
  { id: 'matchup', label: 'Matchup' },
  { id: 'players', label: 'Players' },
  { id: 'movement', label: 'Movement' },
  { id: 'slip', label: 'Slip' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const TIME_FORMAT = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });

export function GameDetailPage() {
  const { id } = useParams();
  const gameId = Number(id);
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabId>('players');
  const [matchup, setMatchup] = useState<MatchupResponse | null>(null);

  useEffect(() => {
    fetchMatchup(gameId).then(setMatchup);
  }, [gameId]);

  return (
    <div>
      <div className="flex items-center gap-3 px-4 pb-[13px] pt-[15px]">
        <button onClick={() => navigate('/')} className="font-cond text-lg text-ink-dim hover:text-ink" aria-label="Back to today">
          ←
        </button>
        {matchup ? (
          <>
            <h1 className="flex-1 truncate font-cond text-[23px] font-semibold tracking-tight text-ink">
              {matchup.game.awayTeam} at {matchup.game.homeTeam}
            </h1>
            <span className="tabular shrink-0 text-xs text-ink-dim">{TIME_FORMAT.format(new Date(matchup.game.kickoffUtc))}</span>
          </>
        ) : (
          <h1 className="flex-1 font-cond text-[23px] font-semibold text-ink">Loading…</h1>
        )}
      </div>

      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      <div className="px-[18px] py-4">
        {tab === 'matchup' && <MatchupTab gameId={gameId} matchup={matchup} />}
        {tab === 'players' && <PlayersTab gameId={gameId} />}
        {tab === 'movement' && <MovementTab gameId={gameId} />}
        {tab === 'slip' && <SlipTab />}
      </div>
    </div>
  );
}
