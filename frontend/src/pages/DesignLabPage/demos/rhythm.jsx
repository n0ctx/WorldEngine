import { useState } from 'react';
import Button from '../../../components/ui/Button.jsx';
import { useMotion } from '../../../core/hooks/useMotion.js';
import { MOTION, STAGGER } from '../../../core/utils/motion.js';
import SlotSection from '../SlotSection.jsx';

const LANES = [
  { id: 'state', name: '状态', curve: '墨水', use: '悬停、色变、边框、显隐、浮起、小位移' },
  { id: 'enter', name: '展开', curve: '墨水', use: '折叠展开、面板入场' },
  { id: 'exit', name: '收起', curve: '收回', use: '折叠收起、离场' },
  { id: 'page', name: '页面', curve: '翻页', use: '侧抽屉开合、章节开场' },
];
const ms = (seconds) => Math.round(seconds * 1000);

/** 节奏尺：各动效角色同时起跑，直接比快慢和曲线；错峰一行按间隔逐个亮起。时长按当前动效包的改写显示。 */
export function RhythmDemo() {
  const { pack } = useMotion();
  const [on, setOn] = useState(false);
  return (
    <SlotSection
      id="rhythm"
      actions={<Button variant="secondary" size="sm" onClick={() => setOn((v) => !v)}>{on ? '回放' : '播放'}节奏尺</Button>}
    >
      <div className="we-design-lab__rhythm" data-on={on || undefined}>
        {LANES.map((lane) => (
          <div key={lane.id} className={`we-design-lab__rhythm-lane we-design-lab__rhythm-lane--${lane.id}`}>
            <span className="we-type-ui">{lane.name} · {ms(pack.rhythm[lane.id]?.duration ?? MOTION[lane.id].duration)}ms · {lane.curve}</span>
            <span className="we-design-lab__rhythm-track"><span className="we-design-lab__rhythm-dot" /></span>
            <span className="we-type-caption we-design-lab__rhythm-use">{lane.use}</span>
          </div>
        ))}
        <div className="we-design-lab__rhythm-lane we-design-lab__rhythm-lane--stagger">
          <span className="we-type-ui">错峰 · 每项 {ms(STAGGER)}ms</span>
          <span className="we-design-lab__rhythm-track">
            {[0, 1, 2, 3, 4].map((i) => <span key={i} className="we-design-lab__rhythm-dot" style={{ '--i': i }} />)}
          </span>
          <span className="we-type-caption we-design-lab__rhythm-use">列表逐项入场的间隔</span>
        </div>
      </div>
    </SlotSection>
  );
}
