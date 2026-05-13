// assistant/server/tools/adapter.js
//
// 公共工具适配器：把多种工具导出形态归一为 splitTools 期望形态；
// 包装 execute 时统一发 tool_call_started / tool_call_completed SSE 事件，
// 可选注入 cancel 闸门（用于父代理被前端 /cancel 后中断 tool loop）。

import { randomUUID } from 'node:crypto';

import {
  ToolLoopCancelledError,
  isToolLoopControlSignal,
} from '../../../backend/llm/tool-loop-control.js';
import { SSE_EVENTS } from '../sse-events.js';

export function toLLMTool(input, executeOverride) {
  if (input && input.type === 'function' && input.function && typeof input.execute === 'function' && !executeOverride) {
    return input;
  }
  const def = input?.definition ?? input;
  const exec = executeOverride ?? input?.execute;
  if (typeof exec !== 'function') {
    throw new Error('toLLMTool: missing execute function');
  }
  if (def?.type === 'function' && def.function) {
    return { type: 'function', function: def.function, execute: exec };
  }
  if (def?.name) {
    return {
      type: 'function',
      function: { name: def.name, description: def.description, parameters: def.parameters },
      execute: exec,
    };
  }
  throw new Error('toLLMTool: unrecognized definition shape');
}

/**
 * wrapToolEvents(tool, emitFn, opts?)
 *   opts.cancelCheck: () => boolean。若返回 true，在 execute 前/后立刻抛 ToolLoopCancelledError。
 *   opts.makeCallId:  () => string。默认 crypto.randomUUID().slice(0,8)。
 *   opts.onCancelLog: (toolName) => void。命中后置闸门时的日志钩子。
 */
export function wrapToolEvents(tool, emitFn, opts = {}) {
  if (!emitFn) return tool;
  const name = tool.function?.name ?? 'unknown';
  const cancelCheck = opts.cancelCheck ?? (() => false);
  const makeCallId = opts.makeCallId ?? defaultCallId;
  const onCancelLog = opts.onCancelLog ?? (() => {});
  return {
    ...tool,
    execute: async (args) => {
      if (cancelCheck()) throw new ToolLoopCancelledError('task cancelled');
      const callId = makeCallId();
      emitFn({ type: SSE_EVENTS.TOOL_CALL_STARTED, toolName: name, callId });
      try {
        const result = await tool.execute(args);
        if (cancelCheck()) {
          emitFn({ type: SSE_EVENTS.TOOL_CALL_COMPLETED, toolName: name, callId, success: false, error: 'task cancelled mid-execution' });
          onCancelLog(name);
          throw new ToolLoopCancelledError('task cancelled mid-execution');
        }
        const success = !(result && result.ok === false);
        emitFn({
          type: SSE_EVENTS.TOOL_CALL_COMPLETED,
          toolName: name,
          callId,
          success,
          error: success ? undefined : (result?.error ?? 'tool failed'),
        });
        return result;
      } catch (err) {
        if (isToolLoopControlSignal(err)) {
          emitFn({ type: SSE_EVENTS.TOOL_CALL_COMPLETED, toolName: name, callId, success: true });
          throw err;
        }
        emitFn({ type: SSE_EVENTS.TOOL_CALL_COMPLETED, toolName: name, callId, success: false, error: err.message });
        throw err;
      }
    },
  };
}

function defaultCallId() {
  return randomUUID().slice(0, 8);
}
