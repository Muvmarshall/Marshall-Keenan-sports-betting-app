import { useEffect, useState } from 'react';
import { fetchMatchup, type MatchupResponse, type TeamStatSide } from '../lib/api.js';
import { RankBadge } from '../components/RankBadge.js';

const SPLIT_LABEL: Record<string, string> = { overall: 'Overall', rush: 'Rushing', pass: 'Passing' };

interface Props {
  gameId: number;
  matchup: MatchupResponse | null;
}

export function MatchupTab({ gameId, matchup: initial }: Props) {
  const [matchup, setMatchup] = useState<MatchupResponse | null>(initial);

  useEffect(() => {
    if (!initial) fetchMatchup(gameId).then(setMatchup);
    else setMatchup(initial);
  }, [gameId, initial]);

  if (!matchup) return <p className="text-sm text-ink-dim">Loading matchup…</p>;

  const pairings = [
    { offense: matchup.away.offense, defense: matchup.home.defense, offTeam: matchup.game.awayTeam, defTeam: matchup.game.homeTeam },
    { offense: matchup.home.offense, defense: matchup.away.defense, offTeam: matchup.game.homeTeam, defTeam: matchup.game.awayTeam },
  ];

  return (
    <div>
      {matchup.insights.length > 0 && (
        <div className="mb-4 space-y-2">
          {matchup.insights.map((insight, i) => (
            <div key={i} className="rounded-card border-l-2 border-signal bg-surface px-4 py-3 text-[13px] leading-relaxed text-ink-dim">
              {insight.text}
            </div>
          ))}
        </div>
      )}

      {pairings.map((pairing, idx) => (
        <div key={idx} className="mb-5">
          <div className="mb-2 flex items-baseline justify-between font-cond text-lg font-semibold text-ink">
            <span>{pairing.offTeam} offense</span>
            <span className="text-ink-faint">vs</span>
            <span>{pairing.defTeam} defense</span>
          </div>

          {(['overall', 'rush', 'pass'] as const).map((split) => {
            const off = pairing.offense.find((s) => s.split === split);
            const def = pairing.defense.find((s) => s.split === split);
            if (!off || !def) return null;
            return <SplitRow key={split} label={SPLIT_LABEL[split]} offense={off} defense={def} />;
          })}
        </div>
      ))}
    </div>
  );
}

function SplitRow({ label, offense, defense }: { label: string; offense: TeamStatSide; defense: TeamStatSide }) {
  return (
    <div className="mb-2 rounded-card bg-surface px-4 py-3">
      <div className="mb-2 text-xs text-ink-faint">{label}</div>
      <StatLine label="Yards per play" offVal={offense.yardsPerPlay.toFixed(2)} defVal={defense.yardsPerPlay.toFixed(2)} />
      <StatLine
        label="Success rate"
        offVal={`${(offense.successRate * 100).toFixed(1)}%`}
        defVal={`${(defense.successRate * 100).toFixed(1)}%`}
        offRank={offense.srRank}
        defRank={defense.srRank}
      />
      <StatLine
        label="EPA"
        offVal={offense.epa.toFixed(2)}
        defVal={defense.epa.toFixed(2)}
        offRank={offense.epaRank}
        defRank={defense.epaRank}
      />
      <div className="mt-2 flex items-center justify-between border-t border-rule pt-2 text-[11px] text-ink-faint" title="How tough was the schedule that produced this rank?">
        <span>
          Offenses faced: <RankBadge rank={defense.opponentsFacedRank} className="text-[11px]" />
        </span>
        <span>
          Defenses faced: <RankBadge rank={offense.opponentsFacedRank} className="text-[11px]" />
        </span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-3 border-t border-rule pt-2">
        <div>
          <div className="text-[11px] text-ink-faint">Explosive play rate</div>
          <div className="tabular font-cond text-sm font-medium text-ink">{(offense.explosivePct * 100).toFixed(1)}%</div>
        </div>
        <div>
          <div className="text-[11px] text-ink-faint">Explosive allowed</div>
          <div className="tabular font-cond text-sm font-medium text-ink">{(defense.explosivePct * 100).toFixed(1)}%</div>
        </div>
        <div>
          <div className="text-[11px] text-ink-faint">Havoc allowed</div>
          <div className="tabular font-cond text-sm font-medium text-ink">{(offense.havocPct * 100).toFixed(1)}%</div>
        </div>
        <div>
          <div className="text-[11px] text-ink-faint">Havoc created</div>
          <div className="tabular font-cond text-sm font-medium text-ink">{(defense.havocPct * 100).toFixed(1)}%</div>
        </div>
      </div>
    </div>
  );
}

function StatLine({
  label,
  offVal,
  defVal,
  offRank,
  defRank,
}: {
  label: string;
  offVal: string;
  defVal: string;
  offRank?: number;
  defRank?: number;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <div className="tabular flex items-center gap-2 font-cond text-[15px] font-medium text-ink">
        {offVal}
        {offRank !== undefined && <RankBadge rank={offRank} className="text-xs" />}
      </div>
      <div className="text-[11px] text-ink-faint">{label}</div>
      <div className="tabular flex items-center gap-2 font-cond text-[15px] font-medium text-ink">
        {defRank !== undefined && <RankBadge rank={defRank} className="text-xs" />}
        {defVal}
      </div>
    </div>
  );
}
