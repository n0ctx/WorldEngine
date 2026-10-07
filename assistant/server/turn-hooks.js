// 工具循环每轮的两个钩子：模型请求前注入用户插话，模型给出最终回复后检查是否只在嘴上完成了任务。

import { createLogger, formatMeta, previewText } from '../../backend/utils/logger.js';
import * as taskStore from './task-store.js';
import { SSE_EVENTS } from './sse-events.js';
import { WRITE_TOOLS } from './tool-meta.js';

const log = createLogger('as-agent', 'cyan');

// 回复里声称做了改动的说法；配合「本轮没有写入成功」判断模型是否只在嘴上完成了任务
const CLAIMS_CHANGE = /已(经)?(完成|更新|修改|改好|重写|改写|创建|新建|建好|添加|加好|写好|写入|删除|删掉|调整|替换|补充|设置)/;
const UNDONE_NOTE = '（系统附注，不是用户发言）你的回复说已经完成了改动，但这一轮没有任何写入工具成功执行，数据其实没有变。'
  + '现在调用工具真正完成；如果确实不需要改动，就如实说明没有改，不要说已完成。';

export function appendUserMessages(task, messages, emitFn) {
  for (const m of messages) {
    const stamped = taskStore.appendMessage(task.id, { id: m.id, role: 'user', content: m.content });
    if (stamped) emitFn({ type: SSE_EVENTS.USER_MESSAGE, taskId: task.id, messageId: stamped.id });
  }
}

// 组合 steer 与 context guard：每次模型请求前先把排队的用户消息注入，再检查是否要压缩
export function createBeforeTurn(task, contextGuard, emitFn) {
  return async (msgs, iter) => {
    const queued = taskStore.takeUserMessages(task.id);
    appendUserMessages(task, queued.map((content) => ({ content })), emitFn);
    msgs.push(...queued.map((content) => ({ role: 'user', content })));
    const ctxResult = await contextGuard(msgs, iter);
    // steer 注入后即使 context guard 未触发压缩，也必须返回（已被修改的）messages
    return ctxResult ?? (queued.length > 0 ? msgs : null);
  };
}

// 模型没写入任何东西却说已完成时，提醒一次让它接着用工具做；只提醒一次，避免来回拉锯
export function createAfterReply(task, runStart) {
  let nudged = false;
  return async (text) => {
    if (nudged || !CLAIMS_CHANGE.test(text)) return null;
    const wrote = task.messages.slice(runStart)
      .some((m) => m.role === 'tool_call' && m.status === 'done' && WRITE_TOOLS.has(m.toolName));
    if (wrote) return null;
    nudged = true;
    log.warn(`UNDONE_CLAIM  ${formatMeta({ taskId: task.id, reply: previewText(text, { limit: 80 }) })}`);
    return UNDONE_NOTE;
  };
}
