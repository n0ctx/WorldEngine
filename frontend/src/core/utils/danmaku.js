/**
 * 从消息数组里取「最新一条 assistant 消息」的弹幕数组；无则返回 null。
 * 供聊天/写作两个流 hook 在加载历史时复用，决定弹幕带展示哪一轮。
 */
export function latestAssistantDanmaku(msgs) {
  if (!Array.isArray(msgs)) return null;
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === 'assistant') {
      const d = msgs[i].danmaku;
      return Array.isArray(d) && d.length > 0 ? d : null;
    }
  }
  return null;
}

/** 把弹幕数组包成弹幕带 store 的 payload（带 tick 触发动画刷新）；空则 null。 */
export function toDanmakuBand(arr) {
  return Array.isArray(arr) && arr.length > 0 ? { items: arr, tick: Date.now() } : null;
}
