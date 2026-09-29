import { useState } from 'react';
import Button from '../../../components/ui/Button.jsx';
import SlotSection from '../SlotSection.jsx';

export function LegacyEnterDemo() {
  const [run, setRun] = useState(0);
  return (
    <SlotSection
      id="legacy-css-enter"
      actions={<Button variant="secondary" size="sm" onClick={() => setRun((n) => n + 1)}>重播</Button>}
    >
      {/* 盒子带 contain: layout paint，遮罩的 fixed 定位只铺满盒子 */}
      <div key={run} className="we-design-lab__fx-box">
        <div className="we-settings-overlay">
          <div className="we-edit-panel we-edit-panel-overlay">
            <h1 className="we-edit-title">编辑世界</h1>
            <p className="we-design-lab__note">遮罩底色先入场，面板随后落位。</p>
          </div>
        </div>
      </div>
    </SlotSection>
  );
}
