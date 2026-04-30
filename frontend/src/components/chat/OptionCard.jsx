import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

const MotionDiv = motion.div;

/**
 * 选项卡：AI 回复后展示若干行动选项，点击后直接发送；支持折叠/展开。
 * streaming=true 时选项实时更新但不可交互（流式进行中）。
 * onSelect(text, index) — 第二个参数是所选选项的索引。
 * initialCollapsed — 新选项出现时的初始折叠状态（用于保留上一轮的折叠偏好）。
 * onCollapsedChange(collapsed) — 折叠状态变化时回调。
 */
export default function OptionCard({ options, streaming, onSelect, initialCollapsed, onCollapsedChange }) {
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
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className="px-4 pb-2 shrink-0"
    >
      <div className="max-w-[800px] mx-auto">
        {collapsed ? (
          <div className="we-option-card we-option-card--collapsed">
            <span className="we-option-collapsed-hint">ξ( ✿＞◡❛)</span>
            <button className="we-option-dismiss" onClick={() => handleCollapse(false)}>
              展开
            </button>
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
                    className={`we-option-btn${disabled ? ' we-option-btn--disabled' : ''}${isSelected ? ' we-option-btn--selected' : ''}`}
                    onClick={disabled ? undefined : () => {
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
                生成中，选项会继续实时补全
              </div>
            )}
            {!streaming && (
              <button className="we-option-dismiss" onClick={() => handleCollapse(true)}>
                折叠
              </button>
            )}
          </div>
        )}
      </div>
    </MotionDiv>
  );
}
