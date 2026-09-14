interface TabBarProps<T extends string> {
  tabs: readonly { id: T; label: string; disabled?: boolean }[];
  active: T;
  onChange: (id: T) => void;
}

export function TabBar<T extends string>({ tabs, active, onChange }: TabBarProps<T>) {
  return (
    <div className="flex gap-[22px] overflow-x-auto border-b border-rule px-4">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          disabled={tab.disabled}
          onClick={() => !tab.disabled && onChange(tab.id)}
          className={`relative shrink-0 whitespace-nowrap pb-[11px] font-cond text-base font-medium ${
            tab.disabled
              ? 'cursor-default text-ink-faint/50'
              : active === tab.id
                ? 'text-ink after:absolute after:bottom-[-1px] after:left-0 after:right-0 after:h-[2px] after:bg-signal'
                : 'text-ink-faint hover:text-ink-dim'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
