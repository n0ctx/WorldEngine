// 上下文占用检查点：每次模型请求前估算占用并推给面板，达到模型上限的 80% 时把对话压成摘要。

import { ToolLoopCancelledError } from '../../backend/llm/tool-loop-control.js';
import { resolveContextLimit } from '../../backend/services/model-context-limit.js';
import { countContextTokens } from '../../backend/utils/token-counter.js';
import { createLogger, formatMeta } from '../../backend/utils/logger.js';

import * as taskStore from './task-store.js';
import { SSE_EVENTS } from './sse-events.js';
import { summarizeContext, withSummary } from './context-summary.js';

const log = createLogger('as-agent', 'cyan');

const COMPACT_THRESHOLD_RATIO = 0.8;
const CONTINUE_NOTE = '（系统）上下文已自动压缩：更早的对话和已执行的操作见系统提示词末尾的摘要。请按摘要里的「当前工作」和「下一步」接着做，不要从头重做已完成的改动；资源内容记不清时先 read 核对。';

/**
 * @param {object} opts
 * @param {object} opts.task
 * @param {'main'|'aux'} opts.configScope
 * @param {Array} opts.tools          本次运行的工具（含 execute）
 * @param {string} opts.systemPrompt  不含摘要的系统提示词
 * @param {string} opts.anchor        本次运行要完成的用户输入，压缩后原样保留
 * @param {Function} opts.emitFn
 * @param {string} opts.runId
 * @returns {Promise<(messages: Array, iter: number) => Promise<Array|null>>} 工具循环的 beforeTurn
 */
export async function createContextGuard({ task, configScope, tools, systemPrompt, anchor, emitFn, runId }) {
  const limit = await resolveContextLimit(configScope);
  const toolDefs = tools.map(({ type, function: fn }) => ({ type, function: fn }));

  // appended：本次追加到消息列表的记录，压缩时是那条压缩标记
  const report = (messages, appended = []) => {
    const usage = { tokens: countContextTokens(messages, toolDefs), limit };
    taskStore.setContextUsage(task.id, usage);
    emitFn({ type: SSE_EVENTS.CONTEXT_USAGE, taskId: task.id, usage, appended });
    return usage.tokens;
  };

  return async function beforeTurn(messages, iter) {
    const tokensBefore = report(messages);
    if (tokensBefore < limit * COMPACT_THRESHOLD_RATIO) return null;
    const body = messages.filter((m) => m.role !== 'system');
    if (body.length <= 1) {
      log.warn(`CONTEXT_COMPACT SKIP  ${formatMeta({ runId, taskId: task.id, tokens: tokensBefore, limit, reason: 'nothing-to-compact' })}`);
      return null;
    }

    const signal = taskStore.getAbortSignal(task.id);
    let summary;
    try {
      summary = await summarizeContext({ previousSummary: task.modelContext?.summary, messages: body, configScope, signal });
    } catch (err) {
      if (signal?.aborted) throw new ToolLoopCancelledError('task cancelled');
      throw new Error(`上下文压缩失败：${err.message}`, { cause: err });
    }
    if (signal?.aborted) throw new ToolLoopCancelledError('task cancelled');
    if (!summary) throw new Error('上下文压缩失败：模型没有返回摘要');

    const compacted = [
      { role: 'system', content: withSummary(systemPrompt, summary) },
      { role: 'user', content: iter === 0 ? anchor : `${anchor}\n\n${CONTINUE_NOTE}` },
    ];
    const tokensAfter = countContextTokens(compacted, toolDefs);
    // 压缩标记之前的消息都已进摘要：下一轮从标记之后回放
    const marker = taskStore.appendMessage(task.id, { role: 'compaction', tokensBefore, tokensAfter });
    taskStore.setModelContext(task.id, { summary, untilId: marker.id });
    report(compacted, [marker]);
    log.info(`CONTEXT_COMPACT  ${formatMeta({ runId, taskId: task.id, iter, tokensBefore, tokensAfter, limit, summaryChars: summary.length })}`);
    return compacted;
  };
}
