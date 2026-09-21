/**
 * build-turn-context.js — 两种模式共用的上下文装配入口
 *
 * chat 与 writing 的 assembler 返回形状本来不一致（一个嵌套 overrides、一个扁平且多一个 model），
 * 这里抹平成同一个形状，让回合 runner 不必为模式分叉：
 *   { messages, overrides: { temperature, maxTokens, model, cacheableSystem },
 *     recallHitCount, suggestionText, activatedEntries }
 *
 * model 恒存在，chat 恒为 null —— llm/index.js 的 `options.model || llm.model`
 * 把 null 视作未传，与不带该字段等价。
 *
 * 入参收 modeId 字符串而非模式描述符对象：这里只需要模式名，收字符串可以让
 * services/chat.js 的兼容层不反向依赖 app/modes，避免层序倒置。
 */
import { buildPrompt, buildWritingPrompt } from '../../prompts/assembler.js';
import { getConfig } from '../../services/config.js';
import { logPrompt } from '../../utils/logger.js';

const BUILDERS = {
  chat: buildPrompt,
  writing: buildWritingPrompt,
};

export async function buildTurnContext(modeId, sessionId, options = {}) {
  const build = BUILDERS[modeId];
  if (!build) throw new Error(`Unknown mode: ${modeId}`);

  const {
    messages,
    temperature,
    maxTokens,
    model = null,
    cacheableSystem,
    recallHitCount,
    suggestionText,
    activatedEntries,
  } = await build(sessionId, options);

  if (getConfig().log_prompt) logPrompt(sessionId, messages);

  return {
    messages,
    overrides: { temperature, maxTokens, model, cacheableSystem },
    recallHitCount: recallHitCount ?? 0,
    suggestionText: suggestionText ?? null,
    activatedEntries: activatedEntries ?? [],
  };
}
