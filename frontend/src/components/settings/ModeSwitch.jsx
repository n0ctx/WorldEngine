export default function ModeSwitch({ mode, onChange }) {
  return (
    <div className="mb-5 flex w-fit gap-[3px] rounded-md bg-[var(--we-paper-aged)] p-[3px]">
      {[{ key: 'chat', label: '对话' }, { key: 'writing', label: '写作' }].map(({ key, label }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={[
            'cursor-pointer rounded border-0 px-5 py-1 text-[13px] transition-all [font-family:var(--we-font-serif)]',
            mode === key
              ? 'bg-[var(--we-paper-base)] text-[var(--we-ink-primary)] shadow-[0_0_0_1px_var(--we-paper-shadow)]'
              : 'bg-transparent text-[var(--we-ink-faded)]',
          ].join(' ')}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
