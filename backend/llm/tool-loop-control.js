// Provider-agnostic 工具循环骨架。
//
// 设计:把"调一轮 → 跑工具 → 喂回 → 再调"这套循环骨架从各 provider 抽出来,
// 每个 provider 只需暴露 4 个原语:
//   - initState(messages)              : 把入参消息折叠成 provider 自己的状态对象
//   - oneTurn(state, defs, iter, config) : 跑一轮 LLM,返回
//       { kind: 'text', text }                     → 终态
//       { kind: 'tools', toolCalls, assistantBlock, _rawParts? } → 需跑工具
//       { kind: 'fallback' }                        → 退到 completeNoTools
//   - appendToolTurn(state, turn, results) : 把本轮 assistant + tool 结果回写状态
//   - completeNoTools(state, config)       : 兜底无工具回答
//   - stateToMessages?(state)              : completeResultMode='detail' 终态用,折回 messages 数组
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

export const TOOL_LOOP_SIGNAL = Object.freeze({
  TERMINAL: 'terminal',
  AWAITING_APPROVAL: 'awaiting_approval',
  PAUSED: 'paused',
});

export class ToolLoopControlSignal extends Error {
  constructor(kind, payload = {}) {
    super(`tool loop control: ${kind}`);
    this.name = 'ToolLoopControlSignal';
    this.kind = kind;
    this.payload = payload;
  }
}

export function isToolLoopControlSignal(err) {
  return err instanceof ToolLoopControlSignal || err?.name === 'ToolLoopControlSignal';
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
 * @param {'text'|'detail'} [opts.completeResultMode='text']
 *   - 'text'  : 返回最终文本字符串
 *   - 'detail': 返回 { text, messages }
 * @param {number}   [opts.maxIterations]  最大轮数,默认走全局常量
 */
export async function runToolLoop({
  provider,
  messages,
  toolDefs,
  toolHandlers,
  config,
  completeResultMode = 'text',
  maxIterations = LLM_TOOL_RESOLUTION_MAX_ITERATIONS,
}) {
  let state = provider.initState(messages);
  const stateToMessages = () => (provider.stateToMessages ? provider.stateToMessages(state) : state.messages);
  const buildCompleteResult = async (textOrPromise) => {
    const text = await textOrPromise;
    if (completeResultMode === 'detail') {
      return { text, messages: stateToMessages() };
    }
    return text;
  };

  for (let iter = 0; iter < maxIterations; iter++) {
    const turn = await provider.oneTurn(state, toolDefs, iter, config);

    if (turn.kind === 'text') {
      return buildCompleteResult(turn.text);
    }

    if (turn.kind === 'fallback') {
      // 400/422 等模型不识别工具:退到无工具补全
      return buildCompleteResult(provider.completeNoTools(state, config));
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
          const raw = await fn(call.arguments);
          result = typeof raw === 'string' ? raw : JSON.stringify(raw);
        }
      } catch (e) {
        if (isToolLoopCancelledError(e)) throw e;
        if (isToolLoopControlSignal(e)) throw e;
        result = `工具执行失败:${e.message}`;
      }
      results.push(result);
    }

    state = provider.appendToolTurn(state, turn, results);
  }

  // 超出轮数兜底
  return buildCompleteResult(provider.completeNoTools(state, config));
}
