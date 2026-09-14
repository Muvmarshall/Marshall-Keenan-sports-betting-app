interface EdgePillProps {
  edge: number; // 0-1 probability points
  label: 'positive' | 'negative' | 'too_close_to_call';
  className?: string;
}

export function EdgePill({ edge, label, className = '' }: EdgePillProps) {
  const styles =
    label === 'positive'
      ? 'bg-signal-bg text-signal'
      : label === 'negative'
        ? 'bg-caution-bg text-caution'
        : 'bg-raised text-ink-dim';

  const text = label === 'too_close_to_call' ? 'too close to call' : `${edge >= 0 ? '+' : ''}${(edge * 100).toFixed(1)}`;

  return (
    <span className={`tabular rounded-md px-[11px] py-[5px] font-cond text-base font-semibold ${styles} ${className}`}>
      {text}
    </span>
  );
}
