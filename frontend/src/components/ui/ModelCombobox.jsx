import { useState, useRef, useEffect } from 'react';

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
    ? options.filter((o) => o.toLowerCase().includes(inputValue.toLowerCase()))
    : options;

  function handleFocus() {
    setFiltering(false); // 聚焦时重置过滤，显示全部
    setOpen(true);
  }

  function handleInputChange(e) {
    setInputValue(e.target.value);
    setFiltering(true); // 用户开始输入，激活过滤
    onChange(e.target.value);
    if (!open) setOpen(true);
  }

  function handleSelect(option) {
    setInputValue(option);
    setFiltering(false);
    onChange(option);
    setOpen(false);
  }

  function handleToggle() {
    if (disabled) return;
    if (!open) setFiltering(false); // 点箭头展开时不过滤
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
        onFocus={() => {}}
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
          {filtered.map((option) => (
            <li
              key={option}
              onMouseDown={(e) => { e.preventDefault(); handleSelect(option); }}
              style={{
                padding: '7px 14px',
                fontFamily: 'var(--we-font-serif)',
                fontSize: '14px',
                color: option === value ? 'var(--we-vermilion)' : 'var(--we-ink-secondary)',
                cursor: 'pointer', userSelect: 'none',
                transition: 'background 0.12s',
                listStyle: 'none',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--we-paper-aged)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              {option}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
