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
  const displayValue = open || filtering ? inputValue : value;

  function handleFocus() {
    setFiltering(false);
    setOpen(true);
  }

  function handleInputChange(e) {
    setInputValue(e.target.value);
    setFiltering(true);
    if (!open) setOpen(true);
  }

  function handleBlur() {
    if (inputValue !== value) {
      onChange(inputValue);
    }
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
    if (e.key === 'Escape') {
      setOpen(false);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && filtered.length > 0) {
        handleSelect(filtered[0]);
      } else {
        onChange(inputValue);
        setOpen(false);
      }
    }
  }

  return (
    <div ref={containerRef} className={['relative w-full', className].filter(Boolean).join(' ')}>
      <div className="we-combobox-wrap">
        <input
          type="text"
          value={displayValue}
          onChange={handleInputChange}
          onBlur={handleBlur}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          className="we-combobox-input"
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={handleToggle}
          disabled={disabled}
          className="we-combobox-toggle"
          aria-label={open ? '收起列表' : '展开列表'}
        >
          <svg
            className="we-combobox-chevron"
            style={{ transform: open ? 'rotate(180deg)' : 'none' }}
            viewBox="0 0 16 16" fill="none" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
          >
            <path d="M4 6l4 4 4-4" />
          </svg>
        </button>
      </div>
      {open && filtered.length > 0 && (
        <ul className="we-combobox-dropdown">
          {filtered.map((option) => {
            const id = optionId(option);
            const inp = typeof option === 'object' ? formatPrice(option.inputPrice) : null;
            const out = typeof option === 'object' ? formatPrice(option.outputPrice) : null;
            const hasPrice = inp != null || out != null;
            return (
              <li
                key={id}
                onMouseDown={(e) => { e.preventDefault(); handleSelect(option); }}
                className={`we-combobox-option${id === value ? ' we-combobox-option--selected' : ''}`}
              >
                <span className="we-combobox-option-id">{id}</span>
                {hasPrice && (
                  <span className="we-combobox-price">
                    {inp != null ? `↑${inp}` : ''}{inp != null && out != null ? ' ' : ''}{out != null ? `↓${out}` : ''} <span className="we-combobox-price-unit">/1M</span>
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
