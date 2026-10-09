import { create } from 'zustand';

/**
 * 两侧抽屉的展开/收起态。
 *
 * 宽屏（与 shell.css 的抽屉浮层断点一致：>1180px）时三栏常驻，两侧默认展开、推开正文；
 * 窄屏两侧盖在正文上，默认收起。窗口跨过断点时两侧跟着回到该宽度的默认态；
 * 期间用户手动收起或展开，在同一次打开应用里保留，不写入配置。
 *
 * 结构性收起/展开是 shell（book-spread）的职责，这里只是承载态的全局 store——
 * 页面（ChatPage / WritingSpacePage）共用同一套 PageLayout 插槽与同一个 shell 渲染器，
 * 因此展开态也全局共享：同一会话内（不刷新页面）在 chat / writing 间切换、或切换会话，
 * 抽屉的开合状态都会保留。
 *
 * stateFocus：从正文跳到状态面板某个字段的请求（回复下方的本轮变化条发出）。
 * tab 是面板页签的 key（世界区块不在页签里时为 null），fieldKeys 是该字段在面板里可能的行 key；
 * 面板展开后切到页签、定位到行，再调 clearStateFocus 收掉请求。
 */
let focusSeq = 0;

const DOCKED_QUERY = '(min-width: 1181px)';
const dockedQuery = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  ? window.matchMedia(DOCKED_QUERY)
  : null;
const docked = dockedQuery?.matches ?? false;

const useSidePanelsStore = create((set) => ({
  leftOpen: docked,
  rightOpen: docked,
  stateFocus: null,
  toggleLeft: () => set((s) => ({ leftOpen: !s.leftOpen })),
  toggleRight: () => set((s) => ({ rightOpen: !s.rightOpen })),
  revealStateField: ({ tab = null, fieldKeys = [] }) => {
    focusSeq += 1;
    set({ rightOpen: true, stateFocus: { tab, fieldKeys, nonce: focusSeq } });
  },
  clearStateFocus: () => set({ stateFocus: null }),
}));

dockedQuery?.addEventListener?.('change', (event) => {
  useSidePanelsStore.setState({ leftOpen: event.matches, rightOpen: event.matches });
});

export default useSidePanelsStore;
