import { useState, useRef, useEffect } from 'react';

/**
 * 自定义下拉选择组件（固定选项，无自由输入）
 * options: { value: string, label: string }[]
 */
export default function Select({
  value = '',
  onChange,
  options = [],
  disabled = false,
  className = '',
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    function handle(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const selected = options.find((o) => o.value === value);

  function handleSelect(optValue) {
    onChange(optValue);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className={['relative w-full', className].filter(Boolean).join(' ')}>
      <button
        type="button"
        onClick={() => !disabled && setOpen((p) => !p)}
        disabled={disabled}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '9px 12px',
          background: 'rgba(0,0,0,0.03)',
          border: `1px solid var(--we-paper-shadow)`,
          borderRadius: 'var(--we-radius-none)',
          fontFamily: 'var(--we-font-serif)',
          fontSize: '14.5px',
          color: selected ? 'var(--we-ink-primary)' : 'var(--we-ink-faded)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          outline: 'none',
          transition: 'border-color 0.18s, box-shadow 0.18s',
          textAlign: 'left',
        }}
        onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.borderColor = 'var(--we-vermilion)'; }}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.borderColor = 'var(--we-paper-shadow)'; }}
      >
        <span>{selected ? selected.label : '—'}</span>
        <svg
          style={{ width: 14, height: 14, flexShrink: 0, color: 'var(--we-ink-faded)', transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'none' }}
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>
      {open && (
        <ul style={{
          position: 'absolute', zIndex: 50,
          top: 'calc(100% + 2px)', left: 0, right: 0,
          background: 'var(--we-paper-base)',
          border: '1px solid var(--we-paper-shadow)',
          borderRadius: 'var(--we-radius-sm)',
          boxShadow: '0 4px 16px rgba(42,31,23,0.14)',
          overflowY: 'auto',
          maxHeight: '12rem',
          padding: '4px 0',
          scrollbarWidth: 'thin',
          scrollbarColor: 'var(--we-paper-shadow) transparent',
        }}>
          {options.map((option) => (
            <li
              key={option.value}
              onMouseDown={(e) => { e.preventDefault(); handleSelect(option.value); }}
              style={{
                padding: '7px 14px',
                fontFamily: 'var(--we-font-serif)',
                fontSize: '14px',
                color: option.value === value ? 'var(--we-vermilion)' : 'var(--we-ink-secondary)',
                cursor: 'pointer',
                userSelect: 'none',
                listStyle: 'none',
                transition: 'background 0.12s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--we-paper-aged)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              {option.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
