import { useState } from 'react';
import BookSpread from '../../shells/book-spread/layout/BookSpread.jsx';
import PageLeft from '../../shells/book-spread/layout/PageLeft.jsx';
import PageRight from '../../shells/book-spread/layout/PageRight.jsx';
import SideDrawer from '../../shells/book-spread/layout/SideDrawer.jsx';

const LEFT_ITEMS = ['雨夜里的拳场', '诊所后巷', '与艾拉的对话'];
const RIGHT_ITEMS = ['生命 87', '好感度 40', '位置 贫民区'];

function DrawerList({ items }) {
  return (
    <ul className="we-design-lab__drawer-list">
      {items.map((item) => <li key={item}>{item}</li>)}
    </ul>
  );
}

/**
 * 实验室里的「书页外壳」：真实的 BookSpread + 左右 SideDrawer + 中栏纸面，收进固定尺寸的盒子。
 * 盒子带 contain: layout paint，窄屏下抽屉的 fixed 遮罩只盖住盒子本身。
 */
export default function ShellFrame({ initialLeft = false, children }) {
  const [leftOpen, setLeftOpen] = useState(initialLeft);
  const [rightOpen, setRightOpen] = useState(false);
  return (
    <div className="we-design-lab__shell-box">
      <BookSpread>
        <SideDrawer side="left" open={leftOpen} onToggle={() => setLeftOpen((open) => !open)} label="会话列表">
          <PageLeft><DrawerList items={LEFT_ITEMS} /></PageLeft>
        </SideDrawer>
        <PageRight flush>
          <div className="we-page-right__body">
            <div className="we-chat-center-pane we-design-lab__pane">{children}</div>
            <SideDrawer side="right" open={rightOpen} onToggle={() => setRightOpen((open) => !open)} label="状态面板">
              <DrawerList items={RIGHT_ITEMS} />
            </SideDrawer>
          </div>
        </PageRight>
      </BookSpread>
    </div>
  );
}
