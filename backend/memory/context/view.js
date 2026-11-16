/**
 * view.js — 上下文压缩内核（纯函数，无 I/O）：轮次单元、当前视图、保护区、紧急移出
 *
 * 压缩的最小单位是「轮」（splitRounds：一条玩家消息起到下一条玩家消息前，开场白并入第 1 轮），
 * 一轮里的玩家发言与回复永远一起压缩、一起恢复。原文消息从不改动，视图每次由「原文轮次 + 块」重新推出：
 *   - 块的来源指纹与当前原文对不上（编辑、删除、换了消息）或覆盖范围已不存在时，块失效，
 *     改用它吸收的子块；没有子块覆盖的轮次回到原文。
 *   - 在用的块互不重叠；万一重叠（手工改库等），保留起点更早的，后者按失效处理。
 *
 * 对外暴露：
 *   buildRoundUnits(rawMessages, { scenes, chapterMessageSize, toPromptMessage }) → units
 *   unitDigests(units) / roundsChangedSince(units, digests) → 调用模型前留底各轮指纹，写入时核对有没有被改
 *   resolveView(blocks, units) → { active, stale, covered, raw }
 *   protectedRounds(raw, { budget }) → Set<round>
 *   planEmergencyHide(raw, protectedSet, { overflowTokens }) → Set<round>
 */

import { splitRounds, roundDigest, rangeDigest } from '../../utils/session-rounds.js';
import { countMessages, countTokens } from '../../utils/token-counter.js';
import {
  CONTEXT_PRESERVE_RECENT_ROUNDS,
  CONTEXT_PROTECT_TOKEN_RATIO,
  CONTEXT_SCENE_PROTECT_RATIO,
} from '../../utils/constants.js';

/**
 * 原文消息切成轮次单元。
 * @param {Array} rawMessages  库里的消息行（按时间升序）
 * @param {object} opts
 * @param {Map<number,string>} [opts.scenes]  轮号 → 轮次索引里的场景（turn_records.scene）
 * @param {number|null} [opts.chapterMessageSize]  写作模式每章消息条数；对话模式为 null
 * @param {(msg:object)=>object} opts.toPromptMessage  给模型看的版本（去掉思考过程）
 * @returns {Array<{ round:number, messages:Array, prompt:Array, tokens:number, digest:string, scene:string|null, chapter:number|null }>}
 */
export function buildRoundUnits(rawMessages, { scenes = new Map(), chapterMessageSize = null, toPromptMessage }) {
  const positions = new Map(rawMessages.map((msg, index) => [msg, index]));
  return splitRounds(rawMessages).map(({ roundIndex, messages }) => {
    const prompt = messages.map(toPromptMessage);
    return {
      round: roundIndex,
      messages,
      prompt,
      tokens: countMessages(prompt),
      digest: roundDigest({ messages }),
      scene: scenes.get(roundIndex) || null,
      chapter: chapterMessageSize ? Math.floor(positions.get(messages[0]) / chapterMessageSize) + 1 : null,
    };
  });
}

/** 第 from–to 轮的合并指纹；范围超出现存轮次时返回 null */
export function digestOfRange(units, from, to) {
  if (from < 1 || to > units.length || from > to) return null;
  return rangeDigest(units.slice(from - 1, to).map((unit) => unit.digest));
}

/** 各轮指纹，下标 = 轮号 - 1；调用模型前留底，写入时用 roundsChangedSince 核对 */
export function unitDigests(units) {
  return units.map((unit) => unit.digest);
}

/** 留底之后有没有轮次被改、被删（后面新增的轮次不算） */
export function roundsChangedSince(units, digests) {
  return digests.some((digest, index) => units[index]?.digest !== digest);
}

/** 摘要 token：一律按渲染进提示词的正文估算 */
export function blockTokens(block) {
  return countTokens(block.summary);
}

function isBlockValid(block, units) {
  return digestOfRange(units, block.fromRound, block.toRound) === block.sourceDigest;
}

/**
 * 当前视图：哪些块在用、哪些块失效、哪些轮次仍以原文出现。
 * @param {Array} blocks  listContextBlocks 的结果（含已被吸收的）
 * @param {Array} units   buildRoundUnits 的结果
 * @returns {{ active:Array, stale:string[], covered:Set<number>, raw:Array }}
 *   active：在用的块，按起始轮次升序；stale：失效的块 id（含因重叠被放弃的）
 */
export function resolveView(blocks, units) {
  const ids = new Set(blocks.map((block) => block.id));
  const children = new Map();
  for (const block of blocks) {
    if (!block.consumedBy || !ids.has(block.consumedBy)) continue;
    if (!children.has(block.consumedBy)) children.set(block.consumedBy, []);
    children.get(block.consumedBy).push(block);
  }
  const candidates = [];
  const stale = [];
  const visit = (block) => {
    if (isBlockValid(block, units)) {
      candidates.push(block);
      return;
    }
    stale.push(block.id);
    for (const child of children.get(block.id) ?? []) visit(child);
  };
  for (const block of blocks) {
    if (!block.consumedBy || !ids.has(block.consumedBy)) visit(block);
  }

  candidates.sort((a, b) => a.fromRound - b.fromRound || a.no - b.no);
  const active = [];
  let lastTo = 0;
  for (const block of candidates) {
    if (block.fromRound <= lastTo) {
      stale.push(block.id);
      continue;
    }
    active.push(block);
    lastTo = block.toRound;
  }

  const covered = new Set();
  for (const block of active) {
    for (let round = block.fromRound; round <= block.toRound; round++) covered.add(round);
  }
  return { active, stale, covered, raw: units.filter((unit) => !covered.has(unit.round)) };
}

/** 最近一个写明了场景的原文轮次的场景 */
function currentScene(raw) {
  return raw.findLast((unit) => unit.scene)?.scene ?? null;
}

/**
 * 保护区：始终保留原文、不进入压缩的轮次（只在原文轮次里选）。
 *   - 最新一轮，以及最近 CONTEXT_PRESERVE_RECENT_ROUNDS 轮；
 *   - 再往前，累计不超过短期预算的 CONTEXT_PROTECT_TOKEN_RATIO 的轮次（放不下的那一轮及更早的不保护）；
 *   - 当前场景：与最近写明的场景相同（或还没写场景）的连续轮次，最多到预算的 CONTEXT_SCENE_PROTECT_RATIO。
 * 世界设定、角色与状态、仍在进行的事项不在历史轮次里，由提示词的其他段落注入，本来就不会被压缩。
 */
export function protectedRounds(raw, { budget }) {
  const kept = new Set();
  let tokens = 0;
  for (let i = raw.length - 1; i >= 0; i--) {
    const unit = raw[i];
    const recent = raw.length - i <= CONTEXT_PRESERVE_RECENT_ROUNDS;
    if (!recent && tokens + unit.tokens > budget * CONTEXT_PROTECT_TOKEN_RATIO) break;
    kept.add(unit.round);
    tokens += unit.tokens;
  }

  const scene = currentScene(raw);
  if (scene) {
    for (let i = raw.length - 1; i >= 0; i--) {
      const unit = raw[i];
      if (unit.scene && unit.scene !== scene) break;
      if (tokens + (kept.has(unit.round) ? 0 : unit.tokens) > budget * CONTEXT_SCENE_PROTECT_RATIO) break;
      if (!kept.has(unit.round)) tokens += unit.tokens;
      kept.add(unit.round);
    }
  }
  return kept;
}

/**
 * 兜底移出：压缩迟迟没跟上、原文已超出硬上限时，组装提示词前从最老的未保护原文起移出视野，
 * 直到移出的 token 不少于 overflowTokens。原文仍在库里，也仍是长期召回的候选，可以按需回到提示词。
 */
export function planEmergencyHide(raw, protectedSet, { overflowTokens }) {
  const hidden = new Set();
  let freed = 0;
  for (const unit of raw) {
    if (freed >= overflowTokens) break;
    if (protectedSet.has(unit.round)) continue;
    hidden.add(unit.round);
    freed += unit.tokens;
  }
  return hidden;
}
