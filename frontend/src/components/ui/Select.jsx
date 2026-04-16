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
        className="w-full flex items-center justify-between px-3 py-2 bg-ivory border border-border rounded-lg text-text text-sm text-left focus:outline-none focus:border-accent hover:border-accent transition-colors disabled:opacity-40"
      >
        <span className={selected ? 'text-text' : 'text-text-tertiary'}>
          {selected ? selected.label : '—'}
        </span>
        <svg
          className={['w-4 h-4 flex-shrink-0 text-text-tertiary transition-transform duration-150', open ? 'rotate-180' : ''].filter(Boolean).join(' ')}
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
        <ul className="absolute z-50 top-full left-0 right-0 mt-1 bg-ivory border border-border rounded-lg shadow-whisper overflow-y-auto max-h-[12rem] py-1">
          {options.map((option) => (
            <li
              key={option.value}
              onMouseDown={(e) => { e.preventDefault(); handleSelect(option.value); }}
              className={[
                'px-3 py-2 text-sm cursor-pointer select-none hover:bg-canvas transition-colors',
                option.value === value ? 'text-accent' : 'text-text',
              ].join(' ')}
            >
              {option.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
