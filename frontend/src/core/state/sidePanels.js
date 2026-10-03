import { create } from 'zustand';

/**
 * 两侧抽屉的展开/收起态。
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

const useSidePanelsStore = create((set) => ({
  leftOpen: false,
  rightOpen: false,
  stateFocus: null,
  toggleLeft: () => set((s) => ({ leftOpen: !s.leftOpen })),
  toggleRight: () => set((s) => ({ rightOpen: !s.rightOpen })),
  revealStateField: ({ tab = null, fieldKeys = [] }) => {
    focusSeq += 1;
    set({ rightOpen: true, stateFocus: { tab, fieldKeys, nonce: focusSeq } });
  },
  clearStateFocus: () => set({ stateFocus: null }),
}));

export default useSidePanelsStore;
