export default function ModeSwitch({ mode, onChange }) {
  return (
    <div style={{ display: 'flex', gap: '3px', marginBottom: '20px', background: 'var(--we-paper-aged)', borderRadius: '6px', padding: '3px', width: 'fit-content' }}>
      {[{ key: 'chat', label: '对话' }, { key: 'writing', label: '写作' }].map(({ key, label }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          style={{
            padding: '4px 20px', fontSize: '13px', borderRadius: '4px', border: 'none', cursor: 'pointer',
            background: mode === key ? 'var(--we-paper-base)' : 'transparent',
            color: mode === key ? 'var(--we-ink-primary)' : 'var(--we-ink-faded)',
            fontFamily: 'var(--we-font-serif)',
            boxShadow: mode === key ? '0 0 0 1px var(--we-paper-shadow)' : 'none',
            transition: 'all 0.15s',
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
