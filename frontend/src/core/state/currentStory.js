import { create } from 'zustand';

/**
 * 当前故事线（会话）标题，供 TopBar 面包屑的叶子节点显示。
 *
 * ChatPage / WritingSpacePage 各自在「当前会话确定或切换」时写入自己的标题
 * （chat 用 session.title，兜底角色名；writing 用 session.title，兜底占位文案）；
 * 离开页面时清空，避免面包屑残留上一条故事线的标题。
 * TopBar 只读这个 store，不感知具体是 chat 还是 writing 模式。
 */
const useCurrentStoryStore = create((set) => ({
  title: null,
  setStoryTitle: (title) => set({ title: title || null }),
}));

export default useCurrentStoryStore;
