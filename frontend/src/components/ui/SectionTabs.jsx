import { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { DURATION, EASE } from '../../utils/motion';

const MotionDiv = motion.div;

/**
 * SectionTabs
 *
 * sections: Array<{ key, label, content, actions? }>
 *   - actions: 当此 tab 激活时,渲染在 tab 行下方的 ReactNode(承载该 tab 的快捷操作,例如"重置")
 *
 * 交互:
 *   - active tab 变化时自动 scrollIntoView,让横向滚动条跟随当前 tab
 *   - tab 列表获焦时支持 ← / → 键盘切换(home/end 跳到首尾)
 */
export default function SectionTabs({ sections, defaultKey, variant }) {
  const reactId = useId();
  const layoutId = `tab-indicator-${reactId}`;
  const [storedActive, setActive] = useState(defaultKey ?? sections[0]?.key);
  const [prevIndex, setPrevIndex] = useState(sections.findIndex(s => s.key === (defaultKey ?? sections[0]?.key)));
  // sections 热更新时，若 active 已不在列表中，回退到第一个（仅渲染期推导，不写回状态）
  const active = sections.some((s) => s.key === storedActive) ? storedActive : sections[0]?.key;
  const current = sections.find(s => s.key === active);
  const activeIndex = sections.findIndex(s => s.key === active);
  // dir > 0：向右（内容从右滑入），dir < 0：向左
  const dir = activeIndex > prevIndex ? 1 : -1;

  const listRef = useRef(null);
  const tabRefs = useRef({});

  // active 变化时，把当前 tab 按钮滚到可视区
  useEffect(() => {
    const el = tabRefs.current[active];
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }, [active]);

  const selectByIndex = (nextIdx) => {
    if (nextIdx < 0 || nextIdx >= sections.length) return;
    setPrevIndex(activeIndex);
    setActive(sections[nextIdx].key);
    // 让新 tab 立刻拿到键盘焦点,后续 ←/→ 能继续连按
    requestAnimationFrame(() => {
      tabRefs.current[sections[nextIdx].key]?.focus?.();
    });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      selectByIndex(activeIndex + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      selectByIndex(activeIndex - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      selectByIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      selectByIndex(sections.length - 1);
    }
  };

  return (
    <div className={`we-section-tabs${variant ? ` we-section-tabs--${variant}` : ''}`}>
      <div className="we-section-tabs-bar">
        <div
          ref={listRef}
          className="we-section-tabs-list"
          role="tablist"
          onKeyDown={handleKeyDown}
        >
          {sections.map((s) => (
            <button
              key={s.key}
              ref={(el) => { if (el) tabRefs.current[s.key] = el; }}
              role="tab"
              type="button"
              aria-selected={active === s.key}
              tabIndex={active === s.key ? 0 : -1}
              className={`we-section-tab${active === s.key ? ' active' : ''}`}
              onClick={() => {
                setPrevIndex(activeIndex);
                setActive(s.key);
              }}
            >
              {s.label}
              {active === s.key && (
                <motion.div
                  className="we-section-tab-indicator"
                  layoutId={layoutId}
                  transition={{ duration: DURATION.quick, ease: EASE.ink }}
                />
              )}
            </button>
          ))}
        </div>
        {current?.actions && (
          <div className="we-section-tabs-actions">{current.actions}</div>
        )}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <MotionDiv
          key={active}
          initial={{ opacity: 0, x: dir * 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: dir * -16 }}
          transition={{ duration: DURATION.medium, ease: EASE.ink }}
        >
          {current?.content}
        </MotionDiv>
      </AnimatePresence>
    </div>
  );
}
