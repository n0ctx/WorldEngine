import { useId, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { DURATION, EASE } from '../../utils/motion';

const MotionDiv = motion.div;

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

  return (
    <div className={`we-section-tabs${variant ? ` we-section-tabs--${variant}` : ''}`}>
      <div className="we-section-tabs-bar">
        {sections.map((s) => (
          <button
            key={s.key}
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
