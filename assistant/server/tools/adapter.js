// assistant/server/tools/adapter.js
//
// 包装工具 execute：统一发 tool_call_started / tool_call_completed SSE 事件，
// 并注入 cancel 闸门（前端 /cancel 后中断工具循环）。

import { randomUUID } from 'node:crypto';

import { ToolLoopCancelledError } from '../../../backend/llm/tool-loop-control.js';
import { SSE_EVENTS } from '../sse-events.js';

/**
 * wrapToolEvents(tool, emitFn, opts?)
 *   tool.describe(args): 返回 { summary, target }，随 started 事件发给前端显示操作对象、决定刷新哪类数据。
 *   tool.recordResult: 为 true 时成功结果（写入类工具的简短回执）随 completed 事件带出，写进任务记录。
 *   opts.cancelCheck: () => boolean。返回 true 时在 execute 前/后抛 ToolLoopCancelledError。
 *   opts.makeCallId:  () => string。默认 crypto.randomUUID().slice(0,8)。
 *   opts.onCancelLog: (toolName) => void。命中后置闸门时的日志钩子。
 *
 * 工具失败以 { success: false, error } 返回；其它返回值都视为成功。
 */
export function wrapToolEvents(tool, emitFn, opts = {}) {
  const name = tool.function?.name ?? 'unknown';
  const cancelCheck = opts.cancelCheck ?? (() => false);
  const makeCallId = opts.makeCallId ?? defaultCallId;
  const onCancelLog = opts.onCancelLog ?? (() => {});
  const describe = tool.describe ?? (() => ({}));
  return {
    type: 'function',
    function: tool.function,
    execute: async (args) => {
      if (cancelCheck()) throw new ToolLoopCancelledError('task cancelled');
      const callId = makeCallId();
      const { summary, target } = describe(args ?? {});
      emitFn?.({ type: SSE_EVENTS.TOOL_CALL_STARTED, toolName: name, callId, summary, target });
      try {
        const result = await tool.execute(args);
        if (cancelCheck()) {
          emitFn?.({ type: SSE_EVENTS.TOOL_CALL_COMPLETED, toolName: name, callId, success: false, error: 'task cancelled mid-execution' });
          onCancelLog(name);
          throw new ToolLoopCancelledError('task cancelled mid-execution');
        }
        const failed = result !== null && typeof result === 'object' && result.success === false;
        emitFn?.({
          type: SSE_EVENTS.TOOL_CALL_COMPLETED,
          toolName: name,
          callId,
          success: !failed,
          error: failed ? (result.error ?? 'tool failed') : undefined,
          result: !failed && tool.recordResult ? result : undefined,
        });
        return result;
      } catch (err) {
        if (!(err instanceof ToolLoopCancelledError)) {
          emitFn?.({ type: SSE_EVENTS.TOOL_CALL_COMPLETED, toolName: name, callId, success: false, error: err.message });
        }
        throw err;
      }
    },
  };
}

function defaultCallId() {
  return randomUUID().slice(0, 8);
}
