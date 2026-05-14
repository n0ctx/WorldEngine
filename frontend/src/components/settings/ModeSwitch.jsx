export default function ModeSwitch({ mode, onChange }) {
  return (
    <div className="we-settings-mode-switch" role="tablist" aria-label="设置模式切换">
      {[{ key: 'chat', label: '对话' }, { key: 'writing', label: '写作' }].map(({ key, label }) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={mode === key}
          onClick={() => onChange(key)}
          className={[
            'we-settings-mode-switch-item',
            mode === key
              ? 'is-active'
              : '',
          ].join(' ')}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
