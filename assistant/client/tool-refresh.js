// 写入类工具完成后通知主界面刷新：按操作的资源类型派发事件，
// 让主界面列表不必等到 task_completed 才刷新。

import { WRITE_TOOLS } from '../server/tool-meta.js';

const TARGET_REFRESH_EVENTS = {
  world: 'we:world-updated',
  entry: 'we:world-updated',
  field: 'we:world-updated',
  character: 'we:character-updated',
  persona: 'we:persona-updated',
  css: 'we:css-updated',
  regex: 'we:regex-updated',
  config: 'we:global-config-updated',
};

/** call 是任务记录里的 tool_call 消息，evt 是它的 completed 事件。批量只完成一部分（evt.partial）时也刷新 */
export function dispatchToolRefresh(call, evt) {
  if (typeof window === 'undefined' || !WRITE_TOOLS.has(call?.toolName)) return;
  if (!evt.success && !evt.partial) return;
  const names = new Set((call.targets ?? [call.target]).map((t) => TARGET_REFRESH_EVENTS[t]).filter(Boolean));
  for (const name of names) window.dispatchEvent(new Event(name));
}
