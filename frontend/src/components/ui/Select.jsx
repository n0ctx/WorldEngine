// frontend/src/components/ui/Select.jsx
import { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { DURATION, EASE } from '../../utils/motion.js';

const DROPDOWN_MAX_H = 192; // 12rem = 192px，与 CSS max-height 保持一致
const DROPDOWN_MARGIN = 2;

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
  const [dropUp, setDropUp] = useState(false);
  const containerRef = useRef(null);
  const triggerRef = useRef(null);

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

  function handleToggle() {
    if (disabled) return;
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setDropUp(spaceBelow < DROPDOWN_MAX_H + DROPDOWN_MARGIN);
    }
    setOpen((p) => !p);
  }

  function handleSelect(optValue) {
    onChange(optValue);
    setOpen(false);
  }

  const dropStyle = dropUp
    ? { bottom: `calc(100% + ${DROPDOWN_MARGIN}px)`, top: 'auto', transformOrigin: 'bottom' }
    : { top: `calc(100% + ${DROPDOWN_MARGIN}px)`, bottom: 'auto', transformOrigin: 'top' };

  const yOffset = dropUp ? 4 : -4;

  return (
    <div ref={containerRef} className={['we-select', className].filter(Boolean).join(' ')}>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
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
      <AnimatePresence>
        {open && (
          <motion.ul
            className="we-select-dropdown"
            initial={{ opacity: 0, scaleY: 0.92, y: yOffset }}
            animate={{ opacity: 1, scaleY: 1,    y: 0 }}
            exit={{   opacity: 0, scaleY: 0.92, y: yOffset }}
            transition={{ duration: DURATION.quick, ease: EASE.ink }}
            style={dropStyle}
          >
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
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
