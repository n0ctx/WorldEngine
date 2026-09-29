import { useState } from 'react';
import Input from '../../../components/ui/Input.jsx';
import Range from '../../../components/ui/Range.jsx';
import Select from '../../../components/ui/Select.jsx';
import Textarea from '../../../components/ui/Textarea.jsx';
import ToggleSwitch from '../../../components/ui/ToggleSwitch.jsx';
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
      <div className="we-design-lab__grid">
        <Input placeholder="点不同位置，或用 Tab 聚焦" />
        <Textarea placeholder="多行输入也一样" rows={3} />
      </div>
    </SlotSection>
  );
}

export function SwitchRangeDemo() {
  const [on, setOn] = useState(false);
  const [value, setValue] = useState(40);
  return (
    <SlotSection id="switch-range">
      <div className="we-design-lab__grid">
        <div className="we-design-lab__row">
          <ToggleSwitch checked={on} onChange={setOn} />
          <ToggleSwitch checked={!on} onChange={() => setOn((v) => !v)} />
        </div>
        <Range value={value} min={0} max={100} onChange={(e) => setValue(Number(e.target.value))} />
      </div>
    </SlotSection>
  );
}
