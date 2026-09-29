import { useState } from 'react';
import Button from '../../../components/ui/Button.jsx';
import TopBar from '../../../shells/book-spread/chrome/TopBar.jsx';
import ShellFrame from '../ShellFrame.jsx';
import SlotSection from '../SlotSection.jsx';

export function SideDrawerDemo() {
  const [replay, setReplay] = useState(0);
  return (
    <SlotSection
      id="side-drawer"
      actions={<Button variant="secondary" size="sm" onClick={() => setReplay((n) => n + 1)}>重播入场</Button>}
    >
      <ShellFrame key={replay}>
        <p className="we-design-lab__note">点两侧窄轨上的图标展开或收起抽屉。</p>
      </ShellFrame>
    </SlotSection>
  );
}

export function TopBarDemo() {
  return (
    <SlotSection id="topbar">
      <div className="we-design-lab__topbar-box">
        <TopBar />
      </div>
    </SlotSection>
  );
}
