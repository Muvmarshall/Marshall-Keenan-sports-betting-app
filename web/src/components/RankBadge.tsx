interface RankBadgeProps {
  rank: number | null;
  totalTeams?: number;
  className?: string;
}

/** Rank coloring per spec: top tier signal, middle ink-dim, bottom tier caution. Always shows the numeral. */
export function RankBadge({ rank, totalTeams = 12, className = '' }: RankBadgeProps) {
  if (rank === null) {
    return <span className={`font-cond text-ink-faint ${className}`}>not available</span>;
  }
  const tierSize = Math.max(1, Math.round(totalTeams * 0.31));
  const color =
    rank <= tierSize ? 'text-signal' : rank > totalTeams - tierSize ? 'text-caution' : 'text-ink-dim';

  return <span className={`tabular font-cond font-semibold ${color} ${className}`}>{ordinal(rank)}</span>;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}
