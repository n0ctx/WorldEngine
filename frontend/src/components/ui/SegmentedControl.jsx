import { useRef } from 'react';

/**
 * 单选分段切换：一条胶囊轨道，选中项浮起一块底。键盘按单选组走：←/→（↑/↓）换选项并选中，Tab 只停在选中项上。
 * @param {{ options: { value: string, label: import('react').ReactNode }[], value: string,
 *   onChange: (value: string) => void, size?: 'sm' | 'md', label: string, disabled?: boolean, className?: string }} props
 */
export default function SegmentedControl({ options, value, onChange, size = 'md', label, disabled = false, className = '' }) {
  const itemsRef = useRef([]);
  const current = Math.max(0, options.findIndex((o) => o.value === value));

  function handleKeyDown(event) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const next = (current + step + options.length) % options.length;
    onChange(options[next].value);
    itemsRef.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      className={['we-segmented', size === 'sm' ? 'we-segmented--sm' : '', className].filter(Boolean).join(' ')}
      onKeyDown={handleKeyDown}
    >
      {options.map((option, index) => (
        <button
          key={option.value}
          ref={(node) => { itemsRef.current[index] = node; }}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          tabIndex={index === current ? 0 : -1}
          disabled={disabled}
          className="we-segmented__item"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
