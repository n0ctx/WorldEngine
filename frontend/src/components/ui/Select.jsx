// frontend/src/components/ui/Select.jsx
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
    <div ref={containerRef} className={['we-select', className].filter(Boolean).join(' ')}>
      <button
        type="button"
        onClick={() => !disabled && setOpen((p) => !p)}
        disabled={disabled}
        className={[
          'we-select-trigger',
          selected ? 'has-value' : '',
          open ? 'open' : '',
        ].filter(Boolean).join(' ')}
      >
        <span>{selected ? selected.label : '—'}</span>
        <svg
          className="we-select-chevron"
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
        <ul className="we-select-dropdown">
          {options.map((option) => (
            <li
              key={option.value}
              onMouseDown={(e) => { e.preventDefault(); handleSelect(option.value); }}
              className={[
                'we-select-option',
                option.value === value ? 'we-select-option--active' : '',
              ].filter(Boolean).join(' ')}
            >
              {option.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
