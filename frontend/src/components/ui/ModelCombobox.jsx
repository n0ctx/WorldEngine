import { useState, useRef, useEffect } from 'react';

/** options 支持 string[] 或 { id, inputPrice?, outputPrice? }[] */
function optionId(o) { return typeof o === 'string' ? o : o.id; }

function formatPrice(p) {
  if (p == null || !Number.isFinite(p) || p <= 0) return null;
  if (p < 0.1) return p.toFixed(3).replace(/0+$/, '');
  if (p < 1)   return p.toFixed(2).replace(/0+$/, '');
  if (p < 10)  return p % 1 === 0 ? String(p) : p.toFixed(1);
  return String(Math.round(p));
}

export default function ModelCombobox({
  value = '',
  onChange,
  options = [],
  disabled = false,
  placeholder = '',
  className = '',
}) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const [filtering, setFiltering] = useState(false);
  const containerRef = useRef(null);

  // 下拉关闭时，同步 inputValue 到最新的 value，并重置过滤
  useEffect(() => {
    if (!open) {
      setInputValue(value);
      setFiltering(false);
    }
  }, [value, open]);

  // 点击外部关闭
  useEffect(() => {
    function handle(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  // 只在用户主动输入时才过滤，初始打开时显示全部
  const filtered = filtering && inputValue.trim()
    ? options.filter((o) => optionId(o).toLowerCase().includes(inputValue.toLowerCase()))
    : options;

  function handleFocus() {
    setFiltering(false);
    setOpen(true);
  }

  function handleInputChange(e) {
    setInputValue(e.target.value);
    setFiltering(true);
    onChange(e.target.value);
    if (!open) setOpen(true);
  }

  function handleSelect(option) {
    const id = optionId(option);
    setInputValue(id);
    setFiltering(false);
    onChange(id);
    setOpen(false);
  }

  function handleToggle() {
    if (disabled) return;
    if (!open) setFiltering(false);
    setOpen((p) => !p);
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') setOpen(false);
    else if (e.key === 'Enter' && !open && filtered.length > 0) handleSelect(filtered[0]);
  }

  return (
    <div ref={containerRef} className={['relative w-full', className].filter(Boolean).join(' ')}>
      <div style={{
        display: 'flex', alignItems: 'center', width: '100%',
        background: 'rgba(0,0,0,0.03)',
        border: '1px solid var(--we-paper-shadow)',
        borderRadius: 'var(--we-radius-none)',
        overflow: 'hidden',
        transition: 'border-color 0.18s, box-shadow 0.18s',
      }}
        className="we-combobox-wrap"
      >
        <input
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          style={{
            flex: 1, padding: '9px 12px',
            background: 'transparent',
            fontFamily: 'var(--we-font-serif)',
            fontSize: '14.5px',
            color: 'var(--we-ink-primary)',
            border: 'none', outline: 'none',
          }}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={handleToggle}
          disabled={disabled}
          style={{
            padding: '8px 10px',
            color: 'var(--we-ink-faded)',
            background: 'none', border: 'none', cursor: 'pointer',
            transition: 'color 0.15s',
          }}
          aria-label={open ? '收起列表' : '展开列表'}
        >
          <svg
            style={{ width: 14, height: 14, transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'none' }}
            viewBox="0 0 16 16" fill="none" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
          >
            <path d="M4 6l4 4 4-4" />
          </svg>
        </button>
      </div>
      {open && filtered.length > 0 && (
        <ul style={{
          position: 'absolute', zIndex: 50,
          top: 'calc(100% + 2px)', left: 0, right: 0,
          background: 'var(--we-paper-base)',
          border: '1px solid var(--we-paper-shadow)',
          borderRadius: 'var(--we-radius-sm)',
          boxShadow: '0 4px 16px rgba(42,31,23,0.14)',
          overflow: 'hidden', overflowY: 'auto',
          maxHeight: '12rem',
          padding: '4px 0',
          scrollbarWidth: 'thin',
          scrollbarColor: 'var(--we-paper-shadow) transparent',
        }}>
          {filtered.map((option) => {
            const id = optionId(option);
            const inp = typeof option === 'object' ? formatPrice(option.inputPrice) : null;
            const out = typeof option === 'object' ? formatPrice(option.outputPrice) : null;
            const hasPrice = inp != null || out != null;
            return (
              <li
                key={id}
                onMouseDown={(e) => { e.preventDefault(); handleSelect(option); }}
                style={{
                  padding: '6px 14px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  fontFamily: 'var(--we-font-serif)',
                  fontSize: '14px',
                  color: id === value ? 'var(--we-vermilion)' : 'var(--we-ink-secondary)',
                  cursor: 'pointer', userSelect: 'none',
                  transition: 'background 0.12s',
                  listStyle: 'none',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--we-paper-aged)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{id}</span>
                {hasPrice && (
                  <span style={{
                    flexShrink: 0, marginLeft: '10px',
                    fontSize: '11.5px',
                    fontFamily: 'var(--we-font-ui, var(--we-font-serif))',
                    color: 'var(--we-ink-faded)',
                    opacity: 0.8,
                    whiteSpace: 'nowrap',
                  }}>
                    {inp != null ? `↑${inp}` : ''}{inp != null && out != null ? ' ' : ''}{out != null ? `↓${out}` : ''} <span style={{ opacity: 0.6 }}>/1M</span>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
