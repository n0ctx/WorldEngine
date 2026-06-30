import { create } from 'zustand';

/**
 * 弹幕带的跨层状态：聊天/写作页（页面树内）把「最新一条 AI 消息的弹幕」写进来，
 * 顶部栏 TopBar（页面树外的全局 chrome）读出来渲染。离开会话页时由页面清空。
 *
 * comments: { items: string[], tick: number } | null
 */
export const useDanmakuBandStore = create((set) => ({
  comments: null,
  setComments: (comments) => set({ comments }),
  clear: () => set({ comments: null }),
}));
