import { useState } from 'react';
import OptionCard from '../../../components/chat/OptionCard.jsx';
import { OPTIONS } from '../demos/fixtures.js';
import Compare from './Compare.jsx';

const noop = () => {};

const optionClass = (picked, locked) => [
  'we-option-btn',
  locked && 'we-option-btn--disabled',
  picked && 'we-option-btn--selected',
  locked && !picked && 'we-sketch-option__dimmed',
].filter(Boolean).join(' ');

// 正式 OptionCard 的选项在组件内部，外面套不上逐项动效，所以出样按同样的类名与结构重画一份。
// --i 是入场顺序，--d 是离选中项的远近（其余项由近及远依次退开），--px / --py 是点击位置（墨从那里洇开）。
function OptionCardSketch() {
  const [collapsed, setCollapsed] = useState(false);
  const [selected, setSelected] = useState(-1);
  const locked = selected >= 0;

  const pick = (event, index) => {
    const box = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty('--px', `${event.clientX - box.left}px`);
    event.currentTarget.style.setProperty('--py', `${event.clientY - box.top}px`);
    setSelected(index);
  };

  return (
    <div className="we-sketch-option px-4 pb-2 shrink-0">
      <div className="max-w-[800px] mx-auto">
        {collapsed ? (
          <div className="we-option-card we-option-card--collapsed">
            <span className="we-option-collapsed-hint">ξ( ✿＞◡❛)</span>
            <button type="button" className="we-option-dismiss" onClick={() => setCollapsed(false)}>展开</button>
          </div>
        ) : (
          <div className="we-option-card">
            <div className="we-option-list">
              {OPTIONS.map((opt, i) => (
                <button
                  key={opt}
                  type="button"
                  className={optionClass(i === selected, locked)}
                  style={{ '--i': i, '--d': locked ? Math.abs(i - selected) : 0 }}
                  onClick={locked ? undefined : (event) => pick(event, i)}
                >
                  {opt}
                </button>
              ))}
            </div>
            <button type="button" className="we-option-dismiss" onClick={() => setCollapsed(true)}>折叠</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function OptionCardCompare() {
  return (
    <Compare
      now={<OptionCard options={OPTIONS} streaming={false} onSelect={noop} />}
      sketch={<OptionCardSketch />}
    />
  );
}
