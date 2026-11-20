import * as llm from '../../llm/index.js';
import { resolveAuxScope } from '../../utils/aux-scope.js';
import { resolveContextLimit } from '../../services/model-context-limit.js';
import { countContextTokens, countTokens } from '../../utils/token-counter.js';
import {
  CONTEXT_COMPRESS_INPUT_MAX_TOKENS,
  CONTEXT_COMPRESS_MAX_ITERATIONS,
  CONTEXT_COMPRESS_OUTPUT_MAX_TOKENS,
  CONTEXT_COMPRESS_TIMEOUT_MS,
  LLM_TASK_TEMPERATURE,
} from '../../utils/constants.js';
import { planCompression } from './plan.js';
import { compressToolDefinition, formatPlanFeedback, parseTextActions } from './doctrine.js';

function overlapsAny(block, accepted) {
  return accepted.some((other) => block.fromRound <= other.toRound && other.fromRound <= block.toRound);
}

/**
 * 校验一次提交并把通过的动作并入 accepted；返回写回给模型的说明。
 * 与之前已通过的范围重叠的动作跳过（同一批内的重叠由 planCompression 处理）。
 */
export function acceptActions(actions, planCtx, accepted) {
  const result = planCompression(actions, planCtx);
  const fresh = result.planned.filter((block) => !overlapsAny(block, accepted.map((a) => a.block)));
  const skipped = result.planned.length - fresh.length;
  for (const block of fresh) accepted.push({ block, action: block.action });
  const feedback = formatPlanFeedback({ ...result, planned: fresh });
  return skipped > 0 ? `${feedback}\n- 提示：${skipped} 个范围与之前已记录的范围重叠，已跳过` : feedback;
}

/** 工具提交优先；最终回复里带 JSON 提交时按纯文本协议处理，校验失败给一次重交机会 */
export async function requestActions(messages, planCtx, sessionId) {
  const accepted = [];
  let inputTokens = 0;
  let toolTurns = 0;
  const options = {
    configScope: resolveAuxScope(sessionId),
    callType: 'context_compress',
    conversationId: sessionId,
    timeoutMs: CONTEXT_COMPRESS_TIMEOUT_MS,
    temperature: LLM_TASK_TEMPERATURE,
    maxTokens: CONTEXT_COMPRESS_OUTPUT_MAX_TOKENS,
  };
  const tool = compressToolDefinition((args) => acceptActions(args?.ranges, planCtx, accepted));
  const contextLimit = await resolveContextLimit(options.configScope);
  const toolTokens = countTokens(JSON.stringify(tool));
  if (countContextTokens(messages, [tool]) + options.maxTokens > contextLimit) {
    return { accepted, reason: '副模型窗口不足，本次不压缩' };
  }
  const beforeTurn = (turnMessages) => {
    toolTurns += 1;
    const turnTokens = countContextTokens(turnMessages, [tool]);
    if (turnTokens + options.maxTokens > contextLimit) throw new Error('压缩请求超过副模型窗口');
    inputTokens += turnTokens + CONTEXT_COMPRESS_OUTPUT_MAX_TOKENS;
    if (inputTokens > CONTEXT_COMPRESS_INPUT_MAX_TOKENS) {
      throw new Error('上下文压缩维护批次达到 token 预算上限，已停止后续模型调用');
    }
    return null;
  };
  const { text } = await llm.completeWithToolsDetailed(messages, [tool], {
    ...options, maxIterations: CONTEXT_COMPRESS_MAX_ITERATIONS, beforeTurn,
  });
  // 不支持工具的 provider 在 wrapper 内直连 complete，不会触发 beforeTurn；为其文本重交补记首轮成本。
  if (toolTurns === 0) inputTokens = messages.reduce((sum, message) => sum + countTokens(message.content ?? ''), 0)
    + toolTokens + CONTEXT_COMPRESS_OUTPUT_MAX_TOKENS;
  if (accepted.length > 0) return { accepted, reason: '' };

  const submitted = parseTextActions(text ?? '');
  if (!submitted) return { accepted, reason: String(text ?? '').trim().slice(0, 200) };
  let feedback = acceptActions(submitted.actions, planCtx, accepted);
  if (accepted.length === 0 && submitted.actions.length > 0) {
    const retryMessages = [
      ...messages,
      { role: 'assistant', content: text },
      { role: 'user', content: `${feedback}\n只输出修正后的 JSON。` },
    ];
    const retryTokens = countContextTokens(retryMessages);
    if (retryTokens + options.maxTokens > contextLimit || inputTokens + retryTokens + CONTEXT_COMPRESS_OUTPUT_MAX_TOKENS > CONTEXT_COMPRESS_INPUT_MAX_TOKENS) {
      return { accepted, reason: `${feedback}\n维护批次 token 预算已用尽，未进行额外重试` };
    }
    inputTokens += retryTokens;
    const retry = await llm.complete(retryMessages, options);
    const again = parseTextActions(retry ?? '');
    feedback = again ? acceptActions(again.actions, planCtx, accepted) : feedback;
  }
  return { accepted, reason: accepted.length > 0 ? '' : (submitted.reason || feedback) };
}
