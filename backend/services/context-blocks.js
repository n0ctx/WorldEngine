/**
 * context-blocks.js — 剧情摘要（上下文压缩块）的查看、检索、手改与恢复原文
 *
 * 对外暴露：
 *   getContextOverview(sessionId) → { blocks, stats } | null
 *   getContextBlockSource(sessionId, blockId, { full }) → { block, children, rounds }
 *   editContextBlock(sessionId, blockId, { summary, topic }) → block
 *   restoreContextBlock(sessionId, blockId) → { blocks, stats }
 *   searchContext(sessionId, query) → { hits }
 * 块不存在或已不在用时抛 Error(CONTEXT_BLOCK_NOT_FOUND)，参数不合法时抛其他 Error（接口层转 400）。
 */

import {
  removeContextBlocks,
  saveContextState,
  updateContextBlockText,
} from '../db/queries/context-blocks.js';
import { loadSessionContext, viewStats } from '../memory/context/session-context.js';
import { decideCompression } from '../memory/context/policy.js';
import { blockTokens } from '../memory/context/view.js';
import { rankDocuments } from '../memory/context/search.js';

export const CONTEXT_BLOCK_NOT_FOUND = '剧情摘要块不存在';
const EDIT_SUMMARY_MAX_CHARS = 4000;
const TOPIC_MAX_CHARS = 40;
const SEARCH_MAX_HITS = 20;
const SNIPPET_CHARS = 80;

function presentBlock(block, blocks) {
  return {
    id: block.id,
    no: block.no,
    tier: block.tier,
    topic: block.topic,
    summary: block.summary,
    fromRound: block.fromRound,
    toRound: block.toRound,
    rawTokens: block.rawTokens,
    summaryTokens: blockTokens(block),
    createdRound: block.createdRound,
    origin: block.origin,
    editedAt: block.editedAt,
    childCount: blocks.filter((other) => other.consumedBy === block.id).length,
  };
}

function presentRound(unit) {
  return {
    round: unit.round,
    messages: unit.prompt.map((msg) => ({ id: msg.id, role: msg.role, content: msg.content, createdAt: msg.created_at })),
  };
}

function overviewOf(ctx) {
  return { blocks: ctx.view.active.map((block) => presentBlock(block, ctx.blocks)), stats: viewStats(ctx) };
}

export function getContextOverview(sessionId) {
  const ctx = loadSessionContext(sessionId);
  return ctx ? overviewOf(ctx) : null;
}

function requireActiveBlock(ctx, blockId) {
  const block = ctx?.view.active.find((candidate) => candidate.id === blockId);
  if (!block) throw new Error(CONTEXT_BLOCK_NOT_FOUND);
  return block;
}

/**
 * 块的来源：默认展开一级——它吸收的子块（仍是摘要）加上子块没覆盖的原文轮次；full 时给出覆盖范围内的全部原文。
 */
export function getContextBlockSource(sessionId, blockId, { full = false } = {}) {
  const ctx = loadSessionContext(sessionId);
  const block = requireActiveBlock(ctx, blockId);
  const children = full ? [] : ctx.blocks.filter((other) => other.consumedBy === block.id);
  const childRounds = new Set(children.flatMap((child) => {
    const rounds = [];
    for (let round = child.fromRound; round <= child.toRound; round++) rounds.push(round);
    return rounds;
  }));
  const rounds = ctx.units
    .filter((unit) => unit.round >= block.fromRound && unit.round <= block.toRound && !childRounds.has(unit.round))
    .map(presentRound);
  return {
    block: presentBlock(block, ctx.blocks),
    children: children.sort((a, b) => a.fromRound - b.fromRound).map((child) => presentBlock(child, ctx.blocks)),
    rounds,
  };
}

export function editContextBlock(sessionId, blockId, { summary, topic } = {}) {
  const ctx = loadSessionContext(sessionId);
  const block = requireActiveBlock(ctx, blockId);
  if (typeof summary !== 'string' || !summary.trim()) throw new Error('摘要不能为空');
  if ([...summary].length > EDIT_SUMMARY_MAX_CHARS) throw new Error(`摘要不能超过 ${EDIT_SUMMARY_MAX_CHARS} 字`);
  const nextTopic = topic === undefined ? block.topic : String(topic ?? '').trim();
  if ([...nextTopic].length > TOPIC_MAX_CHARS) throw new Error(`小标题不能超过 ${TOPIC_MAX_CHARS} 字`);
  const updated = updateContextBlockText(sessionId, blockId, { summary: summary.trim(), topic: nextTopic });
  if (!updated) throw new Error(CONTEXT_BLOCK_NOT_FOUND);
  return presentBlock(updated, loadSessionContext(sessionId).blocks);
}

/**
 * 恢复原文（展开一级）：删除这个块，它吸收的子块重新在用，其余轮次回到正文。
 * 把恢复后的可见量记作增长基线，免得下一轮马上又被压回去；之后剧情再增长一个步长才会重新考虑压缩。
 */
export function restoreContextBlock(sessionId, blockId) {
  requireActiveBlock(loadSessionContext(sessionId), blockId);
  removeContextBlocks(sessionId, [blockId]);
  const ctx = loadSessionContext(sessionId);
  const decision = decideCompression({ units: ctx.units, view: ctx.view, protectedSet: ctx.protectedSet, state: ctx.state, budget: ctx.budget });
  saveContextState(sessionId, { baselineTokens: decision.visibleTokens, lastOutcome: 'restored', lastError: null });
  return overviewOf(loadSessionContext(sessionId));
}

function snippet(text) {
  const chars = [...String(text ?? '').replace(/\s+/g, ' ').trim()];
  return chars.length > SNIPPET_CHARS ? `${chars.slice(0, SNIPPET_CHARS).join('')}……` : chars.join('');
}

/** 在在用块的摘要与全部原文轮次里做词法检索；原文轮次标出它现在是否在正文里 */
export function searchContext(sessionId, query) {
  const ctx = loadSessionContext(sessionId);
  if (!ctx) throw new Error('会话不存在');
  const text = String(query ?? '').trim();
  if (!text) throw new Error('检索词不能为空');
  const docs = [
    ...ctx.view.active.map((block) => ({ id: `block:${block.id}`, text: `${block.topic}\n${block.summary}` })),
    ...ctx.units.map((unit) => ({ id: `round:${unit.round}`, text: unit.prompt.map((msg) => msg.content).join('\n') })),
  ];
  const hits = rankDocuments(text, docs).slice(0, SEARCH_MAX_HITS).map(({ id, score }) => {
    const [kind, key] = id.split(':');
    if (kind === 'block') {
      const block = ctx.view.active.find((candidate) => candidate.id === key);
      return { kind, blockId: block.id, no: block.no, fromRound: block.fromRound, toRound: block.toRound, snippet: snippet(block.summary), score };
    }
    const unit = ctx.units[Number(key) - 1];
    return {
      kind,
      fromRound: unit.round,
      toRound: unit.round,
      inView: !ctx.view.covered.has(unit.round),
      snippet: snippet(unit.prompt.findLast((msg) => msg.role === 'assistant')?.content ?? unit.prompt[0]?.content),
      score,
    };
  });
  return { hits };
}
