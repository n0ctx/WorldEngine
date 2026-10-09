import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Button from '../ui/Button.jsx';
import { StreamCaret } from '../message/StreamingMarkdown.jsx';
import { useMotion } from '../../core/hooks/useMotion.js';

const MotionDiv = motion.div;

/**
 * 选项卡：AI 回复后展示若干行动选项，点击后直接发送；支持折叠/展开。
 * streaming=true 时选项实时更新但不可交互（流式进行中）。
 * onSelect(text, index) — 第二个参数是所选选项的索引。
 * initialCollapsed — 新选项出现时的初始折叠状态（用于保留上一轮的折叠偏好）。
 * onCollapsedChange(collapsed) — 折叠状态变化时回调。
 * 入场、选中、其余项退开的动效由动效包的样式决定：--i 是第几项（逐项错开），--d 是离选中项的远近，
 * --px / --py 是点下的位置（墨流从这里洇开；键盘选中时没有触点，从中心开始）。
 */
function markTouchPoint(event) {
  if (!event.detail) return;
  const box = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty('--px', `${event.clientX - box.left}px`);
  event.currentTarget.style.setProperty('--py', `${event.clientY - box.top}px`);
}

function optionClass({ disabled, selected, dismissed }) {
  return [
    'we-option-btn',
    disabled && 'we-option-btn--disabled',
    selected && 'we-option-btn--selected',
    dismissed && 'we-option-btn--dismissed',
  ].filter(Boolean).join(' ');
}

export default function OptionCard({ options, streaming, onSelect, initialCollapsed, onCollapsedChange }) {
  const m = useMotion();
  const [collapsed, setCollapsed] = useState(!!initialCollapsed);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  // 新选项到来时重置选中，折叠态沿用 initialCollapsed
  useEffect(() => {
    if (options?.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollapsed(!!initialCollapsed);
      setSelectedIndex(-1);
    }
  }, [options?.length, initialCollapsed]);

  function handleCollapse(next) {
    setCollapsed(next);
    onCollapsedChange?.(next);
  }

  if (!options?.length) return null;

  const hasSelected = selectedIndex >= 0;

  return (
    <MotionDiv
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={m.role('state')}
      className="pb-2 shrink-0"
    >
      <div className="max-w-[800px] mx-auto">
        {collapsed ? (
          <div className="we-option-card we-option-card--collapsed">
            <span className="we-option-collapsed-hint">ξ( ✿＞◡❛)</span>
            <Button variant="text" size="sm" className="we-option-dismiss" onClick={() => handleCollapse(false)}>
              展开
            </Button>
          </div>
        ) : (
          <div className={`we-option-card${streaming ? ' we-option-card--streaming' : ''}`}>
            <div className="we-option-list">
              {options.map((opt, i) => {
                const isSelected = i === selectedIndex;
                const disabled = streaming || hasSelected;
                return (
                  <button
                    key={i}
                    className={optionClass({ disabled, selected: isSelected, dismissed: hasSelected && !isSelected })}
                    style={{ '--i': i, '--d': hasSelected ? Math.abs(i - selectedIndex) : 0 }}
                    onClick={disabled ? undefined : (event) => {
                      markTouchPoint(event);
                      setSelectedIndex(i);
                      onSelect(opt, i);
                    }}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
            {streaming && (
              <div className="we-option-streaming-hint">
                正在生成<StreamCaret />
              </div>
            )}
            {!streaming && (
              <Button variant="text" size="sm" className="we-option-dismiss" onClick={() => handleCollapse(true)}>
                折叠
              </Button>
            )}
          </div>
        )}
      </div>
    </MotionDiv>
  );
}
