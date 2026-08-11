import { create } from 'zustand';

/**
 * 两侧抽屉的展开/收起态。
 *
 * 结构性收起/展开是 shell（book-spread）的职责，这里只是承载态的全局 store——
 * 页面（ChatPage / WritingSpacePage）共用同一套 PageLayout 插槽与同一个 shell 渲染器，
 * 因此展开态也全局共享：同一会话内（不刷新页面）在 chat / writing 间切换、或切换会话，
 * 抽屉的开合状态都会保留。
 */
const useSidePanelsStore = create((set) => ({
  leftOpen: false,
  rightOpen: false,
  toggleLeft: () => set((s) => ({ leftOpen: !s.leftOpen })),
  toggleRight: () => set((s) => ({ rightOpen: !s.rightOpen })),
}));

export default useSidePanelsStore;
