/**
 * Classic Parchment shell — PageLayout slot renderer.
 *
 * Extracted from AppShell so tests can install the real renderer via
 * `PageLayoutRendererProvider` without dragging in TopBar / GlobalToast /
 * PageTransition. Production code goes through AppShell.
 */
import BookSpread from './BookSpread.jsx';
import PageLeft from './PageLeft.jsx';
import PageRight from './PageRight.jsx';
import SideDrawer from './SideDrawer.jsx';
import MemoryRecallOverlay from '../chrome/MemoryRecallOverlay.jsx';
import useSidePanelsStore from '../../../core/state/sidePanels.js';

// PascalCase 命名：函数体内调用了 zustand hook（useSidePanelsStore），按 React hooks
// 规则的静态命名约定必须是组件形状（大写开头）或 use 前缀。它始终从 PageLayout 组件的
// render 内以同一顺序调用（PageLayoutRendererProvider 的 render 插槽），语义上就是被
// PageLayout 内联渲染的一段组件树，hooks 规则实际成立，这里只是把命名也对齐上。
export default function RenderPageLayout({
  header = null,
  left = null,
  main = null,
  right = null,
  inspector = null,
  overlay = null,
  recall = null,
  leftLabel = '会话列表',
  rightLabel = '状态面板',
}) {
  const leftOpen = useSidePanelsStore((s) => s.leftOpen);
  const rightOpen = useSidePanelsStore((s) => s.rightOpen);
  const toggleLeft = useSidePanelsStore((s) => s.toggleLeft);
  const toggleRight = useSidePanelsStore((s) => s.toggleRight);

  return (
    <>
      <BookSpread>
        {(left != null || recall != null) ? (
          <SideDrawer
            side="left"
            open={leftOpen}
            onToggle={toggleLeft}
            label={leftLabel}
            footer={recall ? <MemoryRecallOverlay {...recall} /> : null}
          >
            <PageLeft>{left}</PageLeft>
          </SideDrawer>
        ) : null}
        <PageRight flush>
          {header}
          <div className="we-page-right__body">
            {main}
            {right != null ? (
              <SideDrawer side="right" open={rightOpen} onToggle={toggleRight} label={rightLabel}>
                {right}
              </SideDrawer>
            ) : null}
            {inspector}
          </div>
        </PageRight>
      </BookSpread>
      {overlay}
    </>
  );
}
