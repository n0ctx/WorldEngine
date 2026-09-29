import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { useMotion } from '../../core/hooks/useMotion.js';
import GooeyNav from '../motion/GooeyNav.jsx';

const MotionDiv = motion.div;
const MotionSpan = motion.span;

// 指示条：左右两条边分开动。朝哪边走，哪边的边用当前包的 move 先到，另一边用 moveTrail 跟上；
// 两者节奏不同时指示条在行进中被拉长、到位后收拢。首次出现与静态模式直接落位
function Indicator({ target, staticMotion }) {
  const { pack, reduced } = useMotion();
  const left = useMotionValue(target.x);
  const right = useMotionValue(target.x + target.width);
  const width = useTransform(() => right.get() - left.get());
  const { x, width: w } = target;

  useEffect(() => {
    if (staticMotion || reduced) {
      left.jump(x);
      right.jump(x + w);
      return undefined;
    }
    const { move, moveTrail } = pack.transitions;
    const forward = x >= left.get();
    const leftMove = animate(left, x, forward ? moveTrail : move);
    const rightMove = animate(right, x + w, forward ? move : moveTrail);
    return () => { leftMove.stop(); rightMove.stop(); };
  }, [x, w, staticMotion, reduced, pack, left, right]);

  return <MotionSpan className="we-section-tab-indicator" style={{ x: left, width }} />;
}

// 键盘切换：按键 → 目标 tab 下标
const KEY_TARGET = {
  ArrowRight: (i) => i + 1,
  ArrowLeft: (i) => i - 1,
  Home: () => 0,
  End: (_, count) => count - 1,
};

/**
 * SectionTabs
 *
 * sections: Array<{ key, label, content, actions? }>
 *   - actions: 当此 tab 激活时,渲染在 tab 行下方的 ReactNode(承载该 tab 的快捷操作,例如"重置")
 * variant: 'gooey' 时 tab 行是一整条分段，选中段与相邻段分格跳开（不画下划线指示器）
 *
 * 交互:
 *   - active tab 变化时自动 scrollIntoView,让横向滚动条跟随当前 tab
 *   - tab 列表获焦时支持 ← / → 键盘切换(home/end 跳到首尾)
 */
export default function SectionTabs({ sections, defaultKey, variant, globalActions, staticMotion = false }) {
  const motionPrefs = useMotion();
  const [storedActive, setActive] = useState(defaultKey ?? sections[0]?.key);
  // sections 热更新时，若 active 已不在列表中，回退到第一个（仅渲染期推导，不写回状态）
  const active = sections.some((s) => s.key === storedActive) ? storedActive : sections[0]?.key;
  const current = sections.find(s => s.key === active);
  const activeIndex = sections.findIndex(s => s.key === active);
  // 切换方向：新内容顺着指示条移动的方向进来；switched 标记挂载后切换过，动效包只在真正切换时给当前页签做强调
  const [shown, setShown] = useState({ index: activeIndex, dir: 1, switched: false });
  if (shown.index !== activeIndex) setShown({ index: activeIndex, dir: activeIndex >= shown.index ? 1 : -1, switched: true });

  const listRef = useRef(null);
  const tabRefs = useRef({});
  const [indicator, setIndicator] = useState(null);
  const gooey = variant === 'gooey';

  // 指示器是列表里常驻的一条线，按当前 tab 的位置和宽度移动；不随 tab 挂卸，
  // 连点时从当前位置接着走。列表宽度变化（抽屉展开、窗口缩放）时重新量一次。
  useLayoutEffect(() => {
    if (gooey) return undefined;
    const measure = () => {
      const el = tabRefs.current[active];
      if (el) setIndicator({ x: el.offsetLeft, width: el.offsetWidth });
    };
    measure();
    if (typeof ResizeObserver === 'undefined' || !listRef.current) return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(listRef.current);
    return () => observer.disconnect();
  }, [active, sections.length, gooey]);

  // active 变化时，把当前 tab 按钮滚到可视区
  useEffect(() => {
    const el = tabRefs.current[active];
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }, [active]);

  const selectByIndex = (nextIdx) => {
    if (nextIdx < 0 || nextIdx >= sections.length) return;
    setActive(sections[nextIdx].key);
    // 让新 tab 立刻拿到键盘焦点,后续 ←/→ 能继续连按
    requestAnimationFrame(() => {
      tabRefs.current[sections[nextIdx].key]?.focus?.({ preventScroll: true });
    });
  };

  const handleKeyDown = (e) => {
    const target = KEY_TARGET[e.key]?.(activeIndex, sections.length);
    if (target === undefined) return;
    e.preventDefault();
    selectByIndex(target);
  };

  const tabs = sections.map((s) => (
    <button
      key={s.key}
      ref={(el) => { if (el) tabRefs.current[s.key] = el; }}
      role="tab"
      type="button"
      aria-selected={active === s.key}
      tabIndex={active === s.key ? 0 : -1}
      className={`we-section-tab${active === s.key ? ' active' : ''}`}
      onClick={() => setActive(s.key)}
    >
      {s.label}
    </button>
  ));

  return (
    <div className={`we-section-tabs${variant ? ` we-section-tabs--${variant}` : ''}${shown.switched ? ' we-section-tabs--switched' : ''}`}>
      <div className="we-section-tabs-bar">
        <div className="we-section-tabs-row">
        <div
          ref={listRef}
          className="we-section-tabs-list"
          role="tablist"
          onKeyDown={handleKeyDown}
        >
          {gooey ? <GooeyNav active={activeIndex}>{tabs}</GooeyNav> : tabs}
          {indicator && <Indicator target={indicator} staticMotion={staticMotion} />}
        </div>
          {globalActions && (
            <span className="we-section-tabs-globals">{globalActions}</span>
          )}
          {!globalActions && current?.actions && (
            <span className="we-section-tabs-globals">{current.actions}</span>
          )}
        </div>
        {globalActions && current?.actions && (
          <div className="we-section-tabs-actions">{current.actions}</div>
        )}
      </div>
      {staticMotion ? (
        <div>{current?.content}</div>
      ) : (
        // 旧内容立即换下、只让新内容进场：等旧内容离场完再进场会在连点时空一拍。
        // 进场方式由动效包的 tabEnter 决定，custom 给出切换方向
        <MotionDiv
          key={active}
          variants={motionPrefs.variant('tabEnter')}
          custom={shown.dir}
          initial={motionPrefs.reduced ? false : 'hidden'}
          animate="visible"
          transition={motionPrefs.transition('overlay')}
        >
          {current?.content}
        </MotionDiv>
      )}
    </div>
  );
}
