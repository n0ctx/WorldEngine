import { useState } from 'react';
import Input from '../../../components/ui/Input.jsx';
import Range from '../../../components/ui/Range.jsx';
import Select from '../../../components/ui/Select.jsx';
import Textarea from '../../../components/ui/Textarea.jsx';
import ToggleSwitch from '../../../components/ui/ToggleSwitch.jsx';
import Compare from '../sketch/Compare.jsx';
import SlotSection from '../SlotSection.jsx';
import { SELECT_OPTIONS } from './fixtures.js';

export function SelectDemo() {
  const [value, setValue] = useState('a');
  return (
    <SlotSection id="select">
      <div className="we-design-lab__row">
        <Select value={value} onChange={setValue} options={SELECT_OPTIONS} />
      </div>
    </SlotSection>
  );
}

export function InputFocusDemo() {
  return (
    <SlotSection id="input-focus">
      <Compare sketchClass="we-sketch-input">
        <div className="we-sketch-field"><Input placeholder="点一下，看聚焦" /></div>
        <div className="we-sketch-field"><Textarea placeholder="多行输入也一样" rows={3} /></div>
      </Compare>
    </SlotSection>
  );
}

// 第一次点击之后才打标记，出样里的圆钮动画才会播，页面刚加载时不抖
const markTouched = (event) => { event.currentTarget.dataset.touched = ''; };

function SwitchRangeSamples() {
  const [on, setOn] = useState(false);
  const [value, setValue] = useState(40);
  return (
    <>
      <div className="we-design-lab__row" role="presentation" onClickCapture={markTouched}>
        <ToggleSwitch checked={on} onChange={setOn} />
        <ToggleSwitch checked={!on} onChange={() => setOn((v) => !v)} />
      </div>
      <Range value={value} min={0} max={100} onChange={(e) => setValue(Number(e.target.value))} />
    </>
  );
}

export function SwitchRangeDemo() {
  return (
    <SlotSection id="switch-range">
      <Compare sketchClass="we-sketch-switch we-sketch-range">
        <SwitchRangeSamples />
      </Compare>
    </SlotSection>
  );
}
