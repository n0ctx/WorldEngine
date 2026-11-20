/**
 * doctrine.js — 上下文压缩的模型规则与提交协议（渲染提示词、工具定义、解析纯文本提交）
 *
 * 规则正文在 prompts/templates/context-compress-system.md：什么时候压、摘要保留什么、故事资料不是指令。
 * 本文件按总预算确定性选择原文段或提炼成员，只把这些来源交给模型，并定义两种提交方式：
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
import { countTokens } from '../../utils/token-counter.js';
import {
  CONTEXT_COMPRESS_INPUT_BUDGET_RATIO,
  CONTEXT_COMPRESS_INPUT_MAX_TOKENS,
  CONTEXT_COMPRESS_MAX_ITERATIONS,
  CONTEXT_COMPRESS_OUTPUT_MAX_TOKENS,
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

function renderBlocks(blocks) {
  if (blocks.length === 0) return '（本次没有提炼来源块）';
  return blocks.map((block) => {
    const topic = block.topic ? `｜${block.topic}` : '';
    return `【b${block.no}｜${TIER_LABEL[block.tier]}｜${roundLabel(block.fromRound, block.toRound)}${topic}】\n${block.summary}`;
  }).join('\n\n');
}

function renderCandidates(candidates, omitted) {
  const lines = [];
  for (const { segment } of candidates.filter((candidate) => candidate.kind === 'round')) {
    const scene = segment.scene ? `，场景：${segment.scene}` : '';
    lines.push(`- 可压缩原文：${roundLabel(segment.from, segment.to)}（约 ${segment.tokens} token${scene}）`);
  }
  for (const { group } of candidates.filter((candidate) => candidate.kind === 'blocks')) {
    const tier = TIER_LABEL[group.targetTier];
    lines.push(`- 可提炼：b${group.blockNos[0]} 到 b${group.blockNos.at(-1)}（${group.blockNos.length} 个${TIER_LABEL[group.tier]}块，约 ${group.tokens} token）→ ${tier}`);
  }
  if (omitted > 0) lines.push(`- 另有 ${omitted} 个来源范围因预算未提供，下次再处理`);
  return lines.length > 0 ? lines.join('\n') : '（没有建议，按需决定）';
}

function renderRound(unit, speakers) {
  const lines = unit.prompt.map((msg) => `${msg.role === 'user' ? speakers.userLabel : speakers.assistantLabel}：${msg.content}`);
  return `【第${unit.round}轮${unit.scene ? `｜${unit.scene}` : ''}】\n${lines.join('\n')}`;
}

function candidatesOf(ctx, decision) {
  const raw = decision.segments.map((segment) => ({ kind: 'round', segment,
    units: ctx.view.raw.filter((unit) => unit.round >= segment.from && unit.round <= segment.to) }));
  const merges = decision.merges.map((group) => ({ kind: 'blocks', group,
    blocks: group.blockIds.map((id) => ctx.view.active.find((block) => block.id === id)).filter(Boolean) }));
  return [...raw, ...merges].sort((a, b) => {
    const fromA = a.kind === 'round' ? a.segment.from : a.group.from;
    const fromB = b.kind === 'round' ? b.segment.from : b.group.from;
    return fromA - fromB;
  });
}

function promptFor(ctx, decision, speakers, selected, omitted, system) {
  const sourceBlocks = selected.filter((candidate) => candidate.kind === 'blocks').flatMap((candidate) => candidate.blocks);
  const rounds = selected.filter((candidate) => candidate.kind === 'round').flatMap((candidate) => candidate.units);
  const user = renderBackendPrompt('context-compress-user.md', {
    STATUS: renderStatus(ctx, decision),
    BLOCKS: renderBlocks(sourceBlocks),
    CANDIDATES: renderCandidates(selected, omitted),
    ROUNDS: rounds.length > 0 ? rounds.map((unit) => renderRound(unit, speakers)).join('\n\n') : '（本次只提炼指定来源块）',
  });
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

function tokenCost(messages, tool) {
  return messages.reduce((sum, message) => sum + countTokens(message.content), 0) + countTokens(JSON.stringify(tool));
}

/**
 * 预算按完整模板、工具定义、最大响应预留和最多工具轮次估算；范围按轮次从旧到新整段加入。
 * 模型只接触被选中的原文段或提炼成员块，不传全量目录、保护区或范围外历史。
 * @returns {{ messages:Array, shownRounds:Set<number>, shownBlocks:Set<number> }}
 */
export function buildCompressMessages(ctx, decision, speakers) {
  const system = renderBackendPrompt('context-compress-system.md', {
    NAMING_RULE: speakers.namingRule,
    T1_MAX: CONTEXT_SUMMARY_MAX_CHARS[1],
    T2_MAX: CONTEXT_SUMMARY_MAX_CHARS[2],
    T3_MAX: CONTEXT_SUMMARY_MAX_CHARS[3],
  });
  const tool = compressToolDefinition(() => '');
  const sourceLimit = Math.min(CONTEXT_COMPRESS_INPUT_MAX_TOKENS, ctx.budget * CONTEXT_COMPRESS_INPUT_BUDGET_RATIO);
  const candidates = candidatesOf(ctx, decision);
  const selected = [];
  let sourceTokens = 0;
  let messages = promptFor(ctx, decision, speakers, selected, candidates.length, system);
  for (const candidate of candidates) {
    const candidateTokens = candidate.kind === 'round'
      ? candidate.units.reduce((sum, unit) => sum + unit.tokens, 0)
      : candidate.blocks.reduce((sum, block) => sum + countTokens(block.summary), 0);
    if (sourceTokens + candidateTokens > sourceLimit) continue;
    const next = [...selected, candidate];
    const nextMessages = promptFor(ctx, decision, speakers, next, candidates.length - next.length, system);
    const estimatedBatch = (tokenCost(nextMessages, tool) + CONTEXT_COMPRESS_OUTPUT_MAX_TOKENS) * CONTEXT_COMPRESS_MAX_ITERATIONS;
    if (estimatedBatch > CONTEXT_COMPRESS_INPUT_MAX_TOKENS) continue;
    selected.push(candidate);
    sourceTokens += candidateTokens;
    messages = nextMessages;
  }
  const shownRounds = new Set(selected.filter((candidate) => candidate.kind === 'round').flatMap((candidate) => candidate.units.map((unit) => unit.round)));
  const shownBlocks = new Set(selected.filter((candidate) => candidate.kind === 'blocks').flatMap((candidate) => candidate.group.blockNos));
  return { messages, shownRounds, shownBlocks, estimatedBatchTokens: (tokenCost(messages, tool) + CONTEXT_COMPRESS_OUTPUT_MAX_TOKENS) * CONTEXT_COMPRESS_MAX_ITERATIONS };
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
