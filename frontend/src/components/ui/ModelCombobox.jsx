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
      <div className="flex items-center w-full bg-ivory border border-border rounded-lg overflow-hidden focus-within:border-accent transition-colors">
        <input
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          className="flex-1 px-3 py-2 bg-transparent text-text text-sm focus:outline-none disabled:opacity-40 placeholder:text-text-tertiary"
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={handleToggle}
          disabled={disabled}
          className="px-2 py-2 text-text-tertiary hover:text-text transition-colors disabled:opacity-40"
          aria-label={open ? '收起列表' : '展开列表'}
        >
          <svg
            className={['w-4 h-4 transition-transform duration-150', open ? 'rotate-180' : ''].filter(Boolean).join(' ')}
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
      </div>
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 top-full left-0 right-0 mt-1 bg-ivory border border-border rounded-lg shadow-whisper overflow-y-auto max-h-[12rem] py-1">
          {filtered.map((option) => (
            <li
              key={option}
              onMouseDown={(e) => { e.preventDefault(); handleSelect(option); }}
              className={[
                'px-3 py-2 text-sm cursor-pointer select-none hover:bg-canvas transition-colors',
                option === value ? 'text-accent' : 'text-text',
              ].join(' ')}
            >
              {option}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
