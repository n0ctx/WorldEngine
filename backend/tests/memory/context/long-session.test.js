/**
 * 长剧情回归：固定语料 150 轮，每轮按真实顺序跑「写入原文 → 轮次索引 → 上下文维护」，
 * 副模型由脚本按系统给出的建议范围提交（脚本化摘要器，见 helpers/story-corpus.js），
 * 检查多代压缩后的视图、原文可恢复、分代可追溯、上下文有界、回退与改动不留污染。
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

import { createTestConfig, createTestSandbox, freshImport, resetMockEnv } from '../../helpers/test-env.js';
import { insertCharacter, insertMessage, insertSession, insertTurnRecord, insertWorld } from '../../helpers/fixtures.js';
import { buildStoryCorpus, scriptedLimit, scriptedSummary } from '../../helpers/story-corpus.js';

const BUDGET = 2000;
const ROUNDS = 150;
const sandbox = createTestSandbox('context-long-session');
sandbox.setEnv();

const corpus = buildStoryCorpus({ rounds: ROUNDS, seed: 11 });
let session;
const promptTokens = new Map();
const calls = { compress: 0, merges: 0 };
let mod;

after(() => {
  resetMockEnv();
  sandbox.cleanup();
});

const summarize = (texts, tier) => scriptedSummary(texts, scriptedLimit(texts, tier));

/** 按系统建议脚本化地提交：每个建议原文段写一级摘要，每组可提炼的块写上一级摘要 */
function scriptActions(ctx, decision) {
  const ranges = decision.segments.map((segment) => ({
    start: `第${segment.from}轮`,
    end: `第${segment.to}轮`,
    topic: segment.scene ?? '',
    summary: summarize(ctx.units.slice(segment.from - 1, segment.to).map((u) => u.prompt.map((m) => m.content).join('\n')), 1),
  }));
  for (const group of decision.merges) {
    const members = ctx.view.active.filter((b) => group.blockIds.includes(b.id));
    ranges.push({
      start: `b${group.blockNos[0]}`,
      end: `b${group.blockNos.at(-1)}`,
      topic: '前情',
      summary: summarize(members.map((b) => b.summary), group.targetTier),
    });
  }
  return ranges;
}

async function maintain() {
  const ctx = mod.loadSessionContext(session.id);
  const decision = mod.decideCompression({ units: ctx.units, view: ctx.view, protectedSet: ctx.protectedSet, state: ctx.state, budget: ctx.budget });
  resetMockEnv();
  if (decision.run) {
    calls.compress += 1;
    calls.merges += decision.merges.length;
    process.env.MOCK_LLM_TOOL_TURNS_QUEUE = JSON.stringify([[{ name: 'compress', arguments: { ranges: scriptActions(ctx, decision) } }], '完成']);
  } else {
    process.env.MOCK_LLM_COMPLETE_ERROR = '门槛没到时不应调用模型';
  }
  const result = await mod.maintainContext(session.id);
  resetMockEnv();
  return result;
}

async function promptFor(text) {
  const message = insertMessage(sandbox.db, session.id, { role: 'user', content: text, created_at: 10_000_000 });
  const result = await mod.buildPrompt(session.id);
  sandbox.db.prepare('DELETE FROM messages WHERE id = ?').run(message.id);
  return result;
}

before(async () => {
  sandbox.writeConfig(createTestConfig({ short_term_token_budget: BUDGET, suggestion_enabled: false, memory_expansion_enabled: false }));
  mod = {
    ...(await freshImport('backend/memory/context/session-context.js')),
    ...(await freshImport('backend/memory/context/policy.js')),
    ...(await freshImport('backend/memory/context/compressor.js')),
    ...(await freshImport('backend/prompts/assembler.js')),
    ...(await freshImport('backend/utils/token-counter.js')),
  };
  const world = insertWorld(sandbox.db, { name: '渡口' });
  const character = insertCharacter(sandbox.db, world.id, { name: '老魏' });
  session = insertSession(sandbox.db, { character_id: character.id, world_id: world.id });
  for (const round of corpus.rounds) {
    insertMessage(sandbox.db, session.id, { id: `u${round.round}`, role: 'user', content: round.user, created_at: round.round * 10 });
    insertMessage(sandbox.db, session.id, { id: `a${round.round}`, role: 'assistant', content: round.assistant, created_at: round.round * 10 + 1 });
    insertTurnRecord(sandbox.db, session.id, { round_index: round.round, summary: round.facts[0]?.text.slice(1) ?? '', scene: round.scene });
    await maintain();
    if (round.round % 10 === 0) {
      const prompt = await promptFor('林遥接着往前走。');
      promptTokens.set(round.round, mod.countContextTokens(prompt.messages));
    }
  }
});

test('多代压缩后视图完整：在用块互不重叠、全部有效，块覆盖的轮次与原文轮次恰好拼成全部轮次；出现二级与三级块', () => {
  const ctx = mod.loadSessionContext(session.id);
  assert.deepEqual(ctx.view.stale, []);
  const covered = [...ctx.view.covered];
  const raw = ctx.view.raw.map((u) => u.round);
  assert.equal(covered.length + raw.length, ROUNDS);
  assert.deepEqual([...covered, ...raw].sort((a, b) => a - b), Array.from({ length: ROUNDS }, (_, i) => i + 1));
  const tiers = new Set(ctx.view.active.map((b) => b.tier));
  assert.ok(tiers.has(3), `应出现三级块，实际 ${[...tiers]}`);
  assert.ok(ctx.blocks.some((b) => b.tier === 2));
  assert.ok(calls.merges > 0);
});

test('上下文有界：原文与摘要都不随轮次线性增长，第 150 轮的提示词不超过第 60 轮的 1.5 倍', () => {
  const at60 = promptTokens.get(60);
  const at150 = promptTokens.get(150);
  assert.ok(at150 < at60 * 1.5, `第60轮 ${at60}，第150轮 ${at150}`);
  const ctx = mod.loadSessionContext(session.id);
  const rawTokens = ctx.view.raw.reduce((sum, u) => sum + u.tokens, 0);
  assert.ok(rawTokens <= BUDGET * 2, `原文 ${rawTokens}`);
  const totalRaw = ctx.units.reduce((sum, u) => sum + u.tokens, 0);
  assert.ok(at150 < totalRaw / 3, `提示词 ${at150}，全部原文 ${totalRaw}`);
});

test('可逆：每个在用块的全部原文与语料逐字一致；沿子块逐级追溯到一级块，覆盖范围首尾相接、恰好拼成上级块', async () => {
  const { getContextBlockSource } = await freshImport('backend/services/context-blocks.js');
  const ctx = mod.loadSessionContext(session.id);
  const byParent = new Map();
  for (const block of ctx.blocks) {
    if (!block.consumedBy) continue;
    if (!byParent.has(block.consumedBy)) byParent.set(block.consumedBy, []);
    byParent.get(block.consumedBy).push(block);
  }
  const trace = (block) => {
    const children = (byParent.get(block.id) ?? []).sort((a, b) => a.fromRound - b.fromRound);
    if (block.tier === 1 && children.length === 0) return [[block.fromRound, block.toRound]];
    assert.ok(children.length >= 2, `b${block.no} 应有子块`);
    assert.equal(children[0].fromRound, block.fromRound);
    assert.equal(children.at(-1).toRound, block.toRound);
    for (let i = 1; i < children.length; i++) assert.equal(children[i].fromRound, children[i - 1].toRound + 1);
    return children.flatMap(trace);
  };
  for (const block of ctx.view.active) {
    const source = getContextBlockSource(session.id, block.id, { full: true });
    for (const { round, messages } of source.rounds) {
      assert.equal(messages[0].content, corpus.rounds[round - 1].user);
      assert.equal(messages[1].content, corpus.rounds[round - 1].assistant);
    }
    assert.equal(source.rounds.length, block.toRound - block.fromRound + 1);
    const leaves = trace(block);
    assert.equal(leaves[0][0], block.fromRound);
    assert.equal(leaves.at(-1)[1], block.toRound);
  }
});

test('仍未兑现的承诺在最终提示词里（摘要或原文）都能找到', async () => {
  const prompt = await promptFor('林遥想起答应过的事。');
  const text = prompt.messages.map((m) => (typeof m.content === 'string' ? m.content : '')).join('\n');
  const open = corpus.facts.filter((f) => f.kind === 'promise' && f.open);
  assert.ok(open.length > 0);
  for (const fact of open) assert.ok(text.includes(fact.key), `缺少未了事项：${fact.text}`);
});

test('原文被改动后，覆盖它的各级块不再出现在提示词里；下一次维护时删除失效块，子块重新在用', async () => {
  const ctx = mod.loadSessionContext(session.id);
  const target = ctx.view.active.find((b) => b.tier >= 2);
  const round = target.fromRound;
  const original = corpus.rounds[round - 1].assistant;
  sandbox.db.prepare('UPDATE messages SET content = ? WHERE id = ?').run('这一轮被改写了，只剩一句：林遥在桥头歇脚。', `a${round}`);
  try {
    const prompt = await promptFor('继续。');
    assert.doesNotMatch(prompt.messages[0].content, new RegExp(target.summary.slice(3, 40).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    const after = mod.loadSessionContext(session.id);
    assert.ok(after.view.stale.includes(target.id));
    assert.ok(after.view.raw.some((u) => u.round === round));

    await maintain();
    const repaired = mod.loadSessionContext(session.id);
    assert.deepEqual(repaired.view.stale, []);
    assert.ok(!repaired.blocks.some((b) => b.id === target.id));
  } finally {
    sandbox.db.prepare('UPDATE messages SET content = ? WHERE id = ?').run(original, `a${round}`);
  }
});

test('回退到第 100 轮：之后建的块全部作废，提示词里不再出现第 100 轮之后的任何事实', async () => {
  const { rollbackSession } = await freshImport('backend/app/shared/rollback/rollback-session.js');
  const { getModeForSession } = await freshImport('backend/app/modes/index.js');
  const { deleteMessagesAfter } = await freshImport('backend/services/sessions.js');
  await rollbackSession(getModeForSession(session.id), session.id, { truncate: () => deleteMessagesAfter('a100') });

  const ctx = mod.loadSessionContext(session.id);
  assert.equal(ctx.latestRound, 100);
  assert.ok(ctx.blocks.every((b) => b.createdRound <= 100 && b.toRound <= 100));
  assert.deepEqual(ctx.view.stale, []);
  const prompt = await promptFor('回到第一百轮之后。');
  const text = prompt.messages.map((m) => m.content).join('\n');
  const kept = new Set(corpus.facts.filter((f) => f.round <= 100).map((f) => f.text));
  const undone = corpus.facts.filter((f) => f.round > 100 && !kept.has(f.text));
  assert.ok(undone.length > 10);
  for (const fact of undone) {
    assert.ok(!text.includes(fact.text.slice(1)), `第${fact.round}轮的事实不应出现：${fact.text}`);
  }
});
