import { useEffect, useState } from 'react';
import { fetchPlayers, type PlayerBlock } from '../lib/api.js';
import { ThresholdCard } from '../components/ThresholdCard.js';
import { useSlip } from '../context/SlipContext.js';
import type { Position } from '@parlay/shared';

const POSITION_ORDER = ['QB', 'RB', 'WR', 'TE'];

export function PlayersTab({ gameId }: { gameId: number }) {
  const [positions, setPositions] = useState<Record<string, PlayerBlock[]> | null>(null);
  const { addLeg, isInSlip } = useSlip();
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    fetchPlayers(gameId).then((res) => setPositions(res.positions));
  }, [gameId]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!positions) return <p className="text-sm text-ink-dim">Loading players…</p>;

  const orderedPositions = [...POSITION_ORDER.filter((p) => positions[p]), ...Object.keys(positions).filter((p) => !POSITION_ORDER.includes(p))];

  if (orderedPositions.length === 0) {
    return <p className="text-sm text-ink-dim">No props posted for this game yet.</p>;
  }

  return (
    <div>
      {toast && (
        <div className="mb-3 rounded-card bg-raised px-3 py-2 text-[13px] text-ink-dim">{toast}</div>
      )}
      {orderedPositions.map((pos) => (
        <div key={pos} className="mb-5">
          <h2 className="mb-2 font-cond text-lg font-semibold text-ink">{pos}</h2>
          {positions[pos].map((player) => (
            <div key={player.playerId} className="mb-3">
              {player.opponentRank && (
                <div className="mb-1 px-1 text-[11px] text-ink-faint">
                  Opponent {player.opponentRank.split} defense ranked {player.opponentRank.srRank}
                  {ordinalSuffix(player.opponentRank.srRank)} in success rate
                </div>
              )}
              {player.props.map((prop) => {
                const legId = `prop:${prop.propId}`;
                return (
                  <ThresholdCard
                    key={prop.propId}
                    playerName={player.name}
                    position={player.position}
                    team={player.team}
                    prop={prop}
                    inSlip={isInSlip(legId)}
                    onAdd={() => {
                      const primary = prop.edge.primary;
                      if (!primary) return;
                      const result = addLeg({
                        id: legId,
                        playerName: player.name,
                        statLabel: prop.statLabel,
                        line: prop.line,
                        side: primary.side,
                        multiplier: primary.multiplier,
                        fairProbability: primary.fairProbability,
                        team: player.team,
                        statType: prop.statType as any,
                        position: player.position as Position,
                      });
                      if (!result.ok && result.reason) setToast(result.reason);
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function ordinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] ?? s[v] ?? s[0];
}
