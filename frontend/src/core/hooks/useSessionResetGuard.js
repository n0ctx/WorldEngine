/**
 * 会话切换检测：sessionId 相对上次调用变化时返回 true 并记下新值，否则返回
 * false。供 useStateDiff / useEntityDiff 等「按会话重置比较基线的前端本地
 * diff」在各自的 useLayoutEffect 里复用，两者的重置分支语义完全一致。
 */
export function didSessionChange(prevSessionRef, sessionId) {
  if (prevSessionRef.current === sessionId) return false;
  prevSessionRef.current = sessionId;
  return true;
}
