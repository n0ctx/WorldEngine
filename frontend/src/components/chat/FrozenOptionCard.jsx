import React, { useState } from 'react';
import Button from '../ui/Button.jsx';

/**
 * 历史冻结选项卡：已使用的选项（不可交互），支持折叠/展开。
 * 与 OptionCard 保持相同的视觉结构，在同一批次 render 中无缝接替活跃选项卡。
 * 全数据 props（options/selectedIndex 引用稳定），memo 避免流式期间整窗口重渲染。
 */
function FrozenOptionCard({ options, selectedIndex, initialCollapsed }) {
  const [collapsed, setCollapsed] = useState(!!initialCollapsed);
  if (!options?.length) return null;
  return (
    <div className="px-4 pb-2 shrink-0">
      <div className="max-w-[800px] mx-auto">
        {collapsed ? (
          <div className="we-option-card we-option-card--collapsed we-option-card--history">
            <span className="we-option-collapsed-hint">ξ( ✿＞◡❛)</span>
            <Button variant="text" size="sm" className="we-option-dismiss" onClick={() => setCollapsed(false)}>展开</Button>
          </div>
        ) : (
          <div className="we-option-card we-option-card--history">
            <div className="flex flex-col gap-1">
              {options.map((opt, i) => (
                <div
                  key={i}
                  className={`we-option-btn we-option-btn--disabled${i === selectedIndex ? ' we-option-btn--selected' : ''}`}
                >
                  {opt}
                </div>
              ))}
            </div>
            <Button variant="text" size="sm" className="we-option-dismiss" onClick={() => setCollapsed(true)}>折叠</Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default React.memo(FrozenOptionCard);
