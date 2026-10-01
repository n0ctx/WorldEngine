import { useId, useState, useRef } from 'react';
import { Check } from 'lucide-react';
import { isImeComposing } from '../../core/utils/ime.js';
import { useClickOutside } from '../../core/hooks/useClickOutside.js';

/** options 支持 string[] 或 { id, inputPrice?, outputPrice? }[] */
function optionId(o) { return typeof o === 'string' ? o : o.id; }

function formatPrice(p) {
  if (p == null || !Number.isFinite(p) || p <= 0) return null;
  if (p < 0.1) return p.toFixed(3).replace(/0+$/, '');
  if (p < 1)   return p.toFixed(2).replace(/0+$/, '');
  if (p < 10)  return p % 1 === 0 ? String(p) : p.toFixed(1);
  return String(Math.round(p));
}

function OptionPrice({ option }) {
  const inp = typeof option === 'object' ? formatPrice(option.inputPrice) : null;
  const out = typeof option === 'object' ? formatPrice(option.outputPrice) : null;
  const cwr = typeof option === 'object' ? formatPrice(option.cacheWritePrice) : null;
  const crd = typeof option === 'object' ? formatPrice(option.cacheReadPrice) : null;
  const hasPrice = inp != null || out != null;

  if (!hasPrice) return null;
  return (
    <span className="we-menu__hint">
      {inp != null ? `↑${inp}` : ''}{inp != null && out != null ? ' ' : ''}{out != null ? `↓${out}` : ''}
      {cwr != null ? ` 写${cwr}` : ''}{crd != null ? ` 读${crd}` : ''}
      {' '}/1M
    </span>
  );
}

// 列表跟在输入框下面：悬停与方向键停留同一种高亮，当前值右侧打勾
function ComboboxList({ id, options, value, active, optionDomId, onPick, onHover }) {
  return (
    <ul id={id} role="listbox" className="we-menu we-combobox-dropdown">
      {options.map((option, index) => {
        const optionValue = optionId(option);
        return (
          <li
            key={optionValue}
            id={optionDomId(index)}
            role="option"
            aria-selected={optionValue === value}
            onMouseDown={(e) => { e.preventDefault(); onPick(option); }}
            onMouseMove={() => { if (index !== active) onHover(index); }}
            className={`we-menu__item${index === active ? ' is-active' : ''}`}
          >
            <span className="we-menu__label">{optionValue}</span>
            <OptionPrice option={option} />
            {optionValue === value && <Check size={14} className="we-menu__check" aria-hidden="true" />}
          </li>
        );
      })}
    </ul>
  );
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
  const [active, setActive] = useState(-1);
  const containerRef = useRef(null);
  const listId = useId();
  const optionDomId = (index) => `${listId}-${index}`;

  useClickOutside(containerRef, () => setOpen(false));

  // 只在用户主动输入时才过滤，初始打开时显示全部
  const filtered = filtering && inputValue.trim()
    ? options.filter((o) => optionId(o).toLowerCase().includes(inputValue.toLowerCase()))
    : options;
  const displayValue = open || filtering ? inputValue : value;

  function handleFocus() {
    setFiltering(false);
    setActive(-1);
    setOpen(true);
  }

  function handleInputChange(e) {
    setInputValue(e.target.value);
    setFiltering(true);
    setActive(-1);
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
    if (isImeComposing(e)) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      if (filtered.length === 0) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (i + step + filtered.length) % filtered.length);
    } else if (e.key === 'Escape') {
      // 下拉展开时 Esc 只收起下拉，不再关闭外层浮层（见 useEscapeKey）
      if (open) e.preventDefault();
      setOpen(false);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && filtered.length > 0) {
        handleSelect(filtered[Math.max(0, active)]);
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
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open && filtered.length > 0}
          aria-controls={open && filtered.length > 0 ? listId : undefined}
          aria-activedescendant={open && active >= 0 ? optionDomId(active) : undefined}
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
        <ComboboxList
          id={listId}
          options={filtered}
          value={value}
          active={active}
          optionDomId={optionDomId}
          onPick={handleSelect}
          onHover={setActive}
        />
      )}
    </div>
  );
}
