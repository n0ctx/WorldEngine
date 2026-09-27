import { useState } from 'react';

/**
 * 历史冻结选项卡：已使用的选项（不可交互），支持折叠/展开。
 * 与 OptionCard 保持相同的视觉结构，在同一批次 render 中无缝接替活跃选项卡。
 */
export default function FrozenOptionCard({ options, selectedIndex, initialCollapsed }) {
  const [collapsed, setCollapsed] = useState(!!initialCollapsed);
  if (!options?.length) return null;
  return (
    <div className="px-4 pb-2 shrink-0">
      <div className="max-w-[800px] mx-auto">
        {collapsed ? (
          <div className="we-option-card we-option-card--collapsed we-option-card--history">
            <span className="we-option-collapsed-hint">ξ( ✿＞◡❛)</span>
            <button className="we-option-dismiss" onClick={() => setCollapsed(false)}>展开</button>
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
            <button className="we-option-dismiss" onClick={() => setCollapsed(true)}>折叠</button>
          </div>
        )}
      </div>
    </div>
  );
}
