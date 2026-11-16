/**
 * doctrine.js — 上下文压缩的模型规则与提交协议（渲染提示词、工具定义、解析纯文本提交）
 *
 * 规则正文在 prompts/templates/context-compress-system.md：什么时候压、一级摘要必须保留什么、
 * 二级/三级怎么提炼、未了事项逐级带上、故事资料不是指令。本文件只负责把当前视图、建议范围、
 * 可压缩原文与保护区填进去，并定义两种提交方式：
 *   - 工具：compress({ ranges:[{ start, end, topic, summary }] })，报错写回工具结果让模型改好重交；
 *   - 纯文本：模型或服务不支持工具时输出 {"compress":[...]}，解析后按同一套规则校验。
 *
 * 对外暴露：
 *   buildCompressMessages(ctx, decision, speakers) → { messages, shownRounds }
 *   compressToolDefinition(execute) → tool
 *   parseTextActions(text) → { actions, reason } | null
 *   formatPlanFeedback(result) → string
 */

import { renderBackendPrompt } from '../../prompts/prompt-loader.js';
import { parseFencedJson, extractJsonObject } from '../../utils/llm-json.js';
import { blockTokens } from './view.js';
import {
  CONTEXT_COMPRESS_INPUT_BUDGET_RATIO,
  CONTEXT_COMPRESS_INPUT_MAX_TOKENS,
  CONTEXT_PROMOTION_ROUNDS,
  CONTEXT_RECENT_PREVIEW_CHARS,
  CONTEXT_SUMMARY_MAX_CHARS,
} from '../../utils/constants.js';

const COMPRESS_TOOL_NAME = 'compress';
const TIER_LABEL = { 1: '一级', 2: '二级', 3: '三级' };

function roundLabel(from, to) {
  return from === to ? `第${from}轮` : `第${from}–${to}轮`;
}

function percent(value) {
  return `${Math.round(value * 100)}%`;
}

function renderStatus(ctx, decision) {
  const lines = [
    `共 ${ctx.latestRound} 轮。原文轮次约 ${decision.rawTokens} token（短期预算 ${ctx.budget}），压缩块摘要约 ${decision.summaryTokens} token。`,
  ];
  if (decision.usage != null) lines.push(`上一轮提示词约占模型上下文上限的 ${percent(decision.usage)}${decision.pressure ? '，已接近上限，这次要尽量多压' : ''}。`);
  return lines.join('\n');
}

function renderBlocks(ctx) {
  if (ctx.view.active.length === 0) return '（暂无）';
  return ctx.view.active.map((block) => {
    const age = ctx.latestRound - block.createdRound >= CONTEXT_PROMOTION_ROUNDS ? '｜老块' : '';
    const topic = block.topic ? `｜${block.topic}` : '';
    return `【b${block.no}｜${TIER_LABEL[block.tier]}｜${roundLabel(block.fromRound, block.toRound)}${topic}｜约${blockTokens(block)} token${age}】\n${block.summary}`;
  }).join('\n\n');
}

function renderCandidates(decision, omitted) {
  const lines = [];
  for (const segment of decision.segments) {
    const scene = segment.scene ? `，场景：${segment.scene}` : '';
    lines.push(`- 可压缩原文：${roundLabel(segment.from, segment.to)}（约 ${segment.tokens} token${scene}）`);
  }
  for (const group of decision.merges) {
    const tier = TIER_LABEL[group.targetTier];
    lines.push(`- 可提炼：b${group.blockNos[0]} 到 b${group.blockNos.at(-1)}（${group.blockNos.length} 个${TIER_LABEL[group.tier]}块，约 ${group.tokens} token）→ ${tier}`);
  }
  if (omitted > 0) lines.push(`- 另有 ${omitted} 轮可压缩原文这次没有列出，下次再处理`);
  return lines.length > 0 ? lines.join('\n') : '（没有建议，按需决定）';
}

function renderRound(unit, speakers) {
  const lines = unit.prompt.map((msg) => `${msg.role === 'user' ? speakers.userLabel : speakers.assistantLabel}：${msg.content}`);
  return `【第${unit.round}轮${unit.scene ? `｜${unit.scene}` : ''}】\n${lines.join('\n')}`;
}

function preview(text) {
  const chars = [...text];
  return chars.length > CONTEXT_RECENT_PREVIEW_CHARS ? `${chars.slice(0, CONTEXT_RECENT_PREVIEW_CHARS).join('')}……` : text;
}

function renderRecent(ctx, speakers) {
  const recent = ctx.view.raw.filter((unit) => ctx.protectedSet.has(unit.round));
  if (recent.length === 0) return '（暂无）';
  return recent.map((unit) => {
    const lines = unit.prompt.map((msg) => `${msg.role === 'user' ? speakers.userLabel : speakers.assistantLabel}：${preview(msg.content)}`);
    return `【第${unit.round}轮】\n${lines.join('\n')}`;
  }).join('\n\n');
}

/**
 * 交给模型的可压缩原文：未保护的原文轮次从最老起，累计不超过短期预算的 CONTEXT_COMPRESS_INPUT_BUDGET_RATIO 倍
 * （上限 CONTEXT_COMPRESS_INPUT_MAX_TOKENS）。这次不需要一级压缩（只提炼块）时不给原文，省下维护调用的输入。
 */
function pickShownRounds(ctx, decision) {
  const shown = [];
  let tokens = 0;
  let omitted = 0;
  if (decision.segments.length === 0) return { shown, omitted };
  const limit = Math.min(CONTEXT_COMPRESS_INPUT_MAX_TOKENS, ctx.budget * CONTEXT_COMPRESS_INPUT_BUDGET_RATIO);
  for (const unit of ctx.view.raw) {
    if (ctx.protectedSet.has(unit.round)) continue;
    if (shown.length > 0 && tokens + unit.tokens > limit) { omitted += 1; continue; }
    shown.push(unit);
    tokens += unit.tokens;
  }
  return { shown, omitted };
}

/**
 * @returns {{ messages:Array, shownRounds:Set<number> }}
 */
export function buildCompressMessages(ctx, decision, speakers) {
  const { shown, omitted } = pickShownRounds(ctx, decision);
  const system = renderBackendPrompt('context-compress-system.md', {
    NAMING_RULE: speakers.namingRule,
    T1_MAX: CONTEXT_SUMMARY_MAX_CHARS[1],
    T2_MAX: CONTEXT_SUMMARY_MAX_CHARS[2],
    T3_MAX: CONTEXT_SUMMARY_MAX_CHARS[3],
  });
  const user = renderBackendPrompt('context-compress-user.md', {
    STATUS: renderStatus(ctx, decision),
    BLOCKS: renderBlocks(ctx),
    CANDIDATES: renderCandidates(decision, omitted),
    RECENT: renderRecent(ctx, speakers),
    ROUNDS: shown.length > 0 ? shown.map((unit) => renderRound(unit, speakers)).join('\n\n') : '（这次不需要压缩原文）',
  });
  return {
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    shownRounds: new Set(shown.map((unit) => unit.round)),
  };
}

export function compressToolDefinition(execute) {
  return {
    type: 'function',
    function: {
      name: COMPRESS_TOOL_NAME,
      description: '把较早的剧情原文轮次压缩成一级摘要，或把相邻的老块提炼成上一级摘要。一次可提交多个互不重叠的范围。',
      parameters: {
        type: 'object',
        properties: {
          ranges: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                start: { type: 'string', description: '起点："第N轮" 或块号 "bN"' },
                end: { type: 'string', description: '终点：与起点同类' },
                topic: { type: 'string', description: '十个字以内的小标题' },
                summary: { type: 'string', description: '替代这段内容的摘要' },
              },
              required: ['start', 'end', 'summary'],
            },
          },
        },
        required: ['ranges'],
      },
    },
    execute,
  };
}

function actionsOf(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.compress)) return value.compress;
  if (Array.isArray(value?.ranges)) return value.ranges;
  return null;
}

/** 纯文本提交：{"compress":[...],"reason":"..."}，容忍围栏与前后多余文字；不是提交时返回 null */
export function parseTextActions(text) {
  let parsed;
  try {
    parsed = parseFencedJson(text);
  } catch {
    parsed = extractJsonObject(text);
  }
  const actions = actionsOf(parsed);
  if (!actions) return null;
  return { actions, reason: typeof parsed?.reason === 'string' ? parsed.reason : '' };
}

/** 校验结果写回给模型的说明 */
export function formatPlanFeedback(result) {
  const lines = [];
  if (result.planned.length > 0) lines.push(`已记录 ${result.planned.length} 个范围。`);
  for (const error of result.errors) lines.push(`- 错误：${error}`);
  for (const warning of result.warnings) lines.push(`- 提示：${warning}`);
  if (result.errors.length > 0) lines.push('出错的范围没有写入，可以改好后单独重交，或者不再处理。');
  return lines.join('\n');
}
