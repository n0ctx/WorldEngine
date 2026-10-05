// frontend/src/components/ui/Select.jsx
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { IconCheck, IconChevronDown } from './icons.jsx';
import { useClickOutside } from '../../core/hooks/useClickOutside.js';
import { useMotion } from '../../core/hooks/useMotion.js';

const GAP = 4;
const EDGE = 8;
const MAX_HEIGHT = 264;
// 下方放得下这么高就往下开，否则哪边空间大往哪边开
const MIN_COMFORT_HEIGHT = 160;

// 列表挂在 body 上、按触发框定位：不被外层滚动容器裁切，也不被后面各自成层的兄弟元素盖住。
// 强调色取自触发框，列表与它所在的控件同一世界配色
function placeList(trigger) {
  const rect = trigger.getBoundingClientRect();
  const style = getComputedStyle(trigger);
  const below = window.innerHeight - rect.bottom - GAP - EDGE;
  const above = rect.top - GAP - EDGE;
  const up = below < MIN_COMFORT_HEIGHT && above > below;
  const left = Math.max(EDGE, Math.min(rect.left, window.innerWidth - EDGE - rect.width));
  return {
    left,
    minWidth: rect.width,
    maxWidth: window.innerWidth - left - EDGE,
    maxHeight: Math.min(MAX_HEIGHT, up ? above : below),
    top: up ? undefined : rect.bottom + GAP,
    bottom: up ? window.innerHeight - rect.top + GAP : undefined,
    '--we-color-accent': style.getPropertyValue('--we-color-accent') || undefined,
  };
}

// 外面滚动或窗口尺寸变化时收起：列表按打开那一刻的位置固定，不跟着漂
function useCloseOnViewportChange(listRef, onClose) {
  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    const close = (event) => {
      if (event.type === 'scroll' && listRef.current?.contains(event.target)) return;
      onCloseRef.current();
    };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [listRef]);
}

// 展开后的列表：持有焦点，方向键移动高亮，Enter / 空格选中，Esc 收起
function SelectList({ id, options, selectedIndex, placement, onChoose, onClose, onEscape }) {
  const m = useMotion();
  const listRef = useRef(null);
  const [active, setActive] = useState(Math.max(0, selectedIndex));
  const optionId = (index) => `${id}-${index}`;

  useCloseOnViewportChange(listRef, onClose);

  useLayoutEffect(() => {
    listRef.current?.focus({ preventScroll: true });
  }, []);

  useLayoutEffect(() => {
    listRef.current?.children[active]?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);

  function handleKeyDown(event) {
    const last = options.length - 1;
    const moves = {
      ArrowDown: () => setActive((i) => Math.min(last, i + 1)),
      ArrowUp: () => setActive((i) => Math.max(0, i - 1)),
      Home: () => setActive(0),
      End: () => setActive(last),
      Enter: () => onChoose(active),
      ' ': () => onChoose(active),
      Escape: () => { onClose(); onEscape?.(); },
    };
    // Tab：收起并把焦点交回按钮，浏览器接着从按钮往后走
    if (event.key === 'Tab') { onClose(); return; }
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    // Esc 只收起列表，不再冒泡去关外层弹窗
    event.stopPropagation();
    move();
  }

  return (
    <motion.ul
      ref={listRef}
      id={id}
      role="listbox"
      tabIndex={-1}
      aria-activedescendant={optionId(active)}
      onKeyDown={handleKeyDown}
      className="we-menu we-select-dropdown we-accent-scope"
      style={placement}
      variants={m.variant('enter')}
      initial="hidden"
      animate="visible"
      exit="exit"
      transition={m.transition('enter')}
      // 列表不在触发框的 DOM 里：按下事件到此为止，外层的"点外面关闭"不会把选择当成点外面
      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
    >
      {options.map((option, index) => (
        <li
          key={option.value}
          id={optionId(index)}
          role="option"
          aria-selected={index === selectedIndex}
          onMouseMove={() => { if (index !== active) setActive(index); }}
          onMouseDown={() => onChoose(index)}
          className={['we-menu__item', index === active ? 'is-active' : ''].filter(Boolean).join(' ')}
        >
          <span className={`we-menu__label${option.value === '' ? ' we-menu__hint' : ''}`}>{option.label}</span>
          {index === selectedIndex && <IconCheck size={14} className="we-menu__check" />}
        </li>
      ))}
    </motion.ul>
  );
}

/**
 * 自定义下拉选择组件（固定选项，无自由输入）
 * options: { value: string, label: string }[]
 * autoOpen：挂载时展开（行内编辑一进入就能选）
 * onEscape：列表展开时按 Esc 收起后调用（行内编辑据此取消）
 * size：md 36 高；sm 28 高、说明文字字号（编辑器里、表单行内）
 * 触发框是按钮、展开后焦点移进列表，由列表处理方向键；收起时焦点回到按钮。
 */
export default function Select({
  value = '',
  onChange,
  options = [],
  disabled = false,
  size = 'md',
  className = '',
  autoOpen = false,
  onEscape,
}) {
  const listId = useId();
  const [placement, setPlacement] = useState(null);
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const open = placement !== null;

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = options[selectedIndex];

  function openList() {
    if (!disabled) setPlacement(placeList(triggerRef.current));
  }

  function close() {
    setPlacement(null);
    triggerRef.current?.focus();
  }

  function choose(index) {
    const option = options[index];
    if (!option) return;
    close();
    onChange(option.value);
  }

  useClickOutside(containerRef, () => setPlacement(null));

  useEffect(() => {
    if (autoOpen) openList();
    // 只在挂载时自动展开一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleTriggerKeyDown(event) {
    if (open || !['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    event.preventDefault();
    openList();
  }

  return (
    <div ref={containerRef} className={['we-select', size === 'sm' ? 'we-select-sm' : '', className].filter(Boolean).join(' ')}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => (open ? close() : openList())}
        onKeyDown={handleTriggerKeyDown}
        disabled={disabled}
        className={[
          'we-select-trigger',
          selected ? 'has-value' : '',
          open ? 'open' : '',
        ].filter(Boolean).join(' ')}
      >
        <span>{selected ? selected.label : '—'}</span>
        <IconChevronDown className="we-select-chevron" />
      </button>
      {createPortal(
        <AnimatePresence>
          {open && (
            <SelectList
              key="list"
              id={listId}
              options={options}
              selectedIndex={selectedIndex}
              placement={placement}
              onChoose={choose}
              onClose={close}
              onEscape={onEscape}
            />
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}
