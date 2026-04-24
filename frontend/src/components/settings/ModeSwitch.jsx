export default function ModeSwitch({ mode, onChange }) {
  return (
    <div className="mb-5 flex w-fit gap-1 rounded-md bg-[var(--we-color-bg-surface)] p-1">
      {[{ key: 'chat', label: '对话' }, { key: 'writing', label: '写作' }].map(({ key, label }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={[
            'cursor-pointer rounded border-0 px-5 py-1 text-[13px] transition-all [font-family:var(--we-font-serif)]',
            mode === key
              ? 'bg-[var(--we-color-bg-canvas)] text-[var(--we-color-text-primary)] shadow-[0_0_0_1px_var(--we-color-border-default)]'
              : 'bg-transparent text-[var(--we-color-text-tertiary)]',
          ].join(' ')}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
