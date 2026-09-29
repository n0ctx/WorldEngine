import { useState } from 'react';
import { MemoryRouter, UNSAFE_LocationContext as LocationContext } from 'react-router-dom';
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
        {/* 顶栏里的按钮会跳转页面：给它一套独立的内存路由，跳转只在盒子里生效，不离开实验室 */}
        <LocationContext.Provider value={null}>
          <MemoryRouter>
            <TopBar />
          </MemoryRouter>
        </LocationContext.Provider>
      </div>
    </SlotSection>
  );
}
