// Provider-agnostic 工具循环骨架。
//
// 设计:把"调一轮 → 跑工具 → 喂回 → 再调"这套循环骨架从各 provider 抽出来,
// 每个 provider 只需暴露 4 个原语:
//   - initState(messages)              : 把入参消息折叠成 provider 自己的状态对象
//   - oneTurn(state, defs, mode, iter, config) : 跑一轮 LLM,返回
//       { kind: 'text', text }                     → 终态
//       { kind: 'tools', toolCalls, assistantBlock, _rawParts? } → 需跑工具
//       { kind: 'fallback' }                        → 退到 completeNoTools
//   - appendToolTurn(state, turn, results) : 把本轮 assistant + tool 结果回写状态
//   - completeNoTools(state, config)       : 兜底无工具回答
//   - stateToMessages?(state)              : mode='resolve' 终态用,折回 messages 数组
//
// 配套:工具 handler 中抛 ToolLoopCancelledError 必须直接透传(cancel 信号),
// 不可被 catch 字符串化喂回模型。

import { LLM_TOOL_RESOLUTION_MAX_ITERATIONS } from '../utils/constants.js';

export class ToolLoopCancelledError extends Error {
  constructor(message = 'tool loop cancelled') {
    super(message);
    this.name = 'ToolLoopCancelledError';
  }
}

export function isToolLoopCancelledError(err) {
  return err instanceof ToolLoopCancelledError || err?.name === 'ToolLoopCancelledError';
}

/**
 * 跑 provider-agnostic 工具循环。
 *
 * @param {object}   opts
 * @param {object}   opts.provider     4 原语 provider 适配器
 * @param {Array}    opts.messages     OpenAI-style 入参消息
 * @param {Array}    opts.toolDefs     工具定义(OpenAI function 格式)
 * @param {object}   opts.toolHandlers name → async handler 映射
 * @param {object}   opts.config       provider 透传配置(含 signal/cacheableSystem 等)
 * @param {'complete'|'resolve'} [opts.mode='complete']
 *   - 'complete':返回最终文本字符串(无工具或兜底)
 *   - 'resolve' :返回 enriched messages 数组;首轮即文本则原样返回入参 messages 引用
 * @param {number}   [opts.maxIterations]  最大轮数,默认走全局常量
 */
export async function runToolLoop({
  provider,
  messages,
  toolDefs,
  toolHandlers,
  config,
  mode = 'complete',
  maxIterations = LLM_TOOL_RESOLUTION_MAX_ITERATIONS,
}) {
  let state = provider.initState(messages);
  let enriched = false;

  for (let iter = 0; iter < maxIterations; iter++) {
    const turn = await provider.oneTurn(state, toolDefs, mode, iter, config);

    if (turn.kind === 'text') {
      if (mode === 'resolve') {
        // 首轮就直接文本 → 没有任何工具增量,返回原始引用
        if (!enriched) return messages;
        return provider.stateToMessages ? provider.stateToMessages(state) : state.messages;
      }
      return turn.text;
    }

    if (turn.kind === 'fallback') {
      // 400/422 等模型不识别工具:退到无工具补全
      if (mode === 'resolve') {
        // resolve 模式下 fallback 等价于"无可 enrich",返回当前可用消息集
        if (!enriched) return messages;
        return provider.stateToMessages ? provider.stateToMessages(state) : state.messages;
      }
      return provider.completeNoTools(state, config);
    }

    // turn.kind === 'tools'
    const calls = turn.toolCalls || [];
    const results = [];
    for (const call of calls) {
      const fn = toolHandlers[call.name];
      let result;
      try {
        if (!fn) {
          result = `工具未定义:${call.name}`;
        } else {
          result = String(await fn(call.arguments));
        }
      } catch (e) {
        if (isToolLoopCancelledError(e)) throw e;
        result = `工具执行失败:${e.message}`;
      }
      results.push(result);
    }

    state = provider.appendToolTurn(state, turn, results);
    enriched = true;
  }

  // 超出轮数兜底
  if (mode === 'resolve') {
    if (!enriched) return messages;
    return provider.stateToMessages ? provider.stateToMessages(state) : state.messages;
  }
  return provider.completeNoTools(state, config);
}
