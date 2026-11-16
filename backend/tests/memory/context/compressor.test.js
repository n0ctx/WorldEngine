import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { createTestConfig, createTestSandbox, freshImport, resetMockEnv } from '../../helpers/test-env.js';
import { insertCharacter, insertContextBlock, insertMessage, insertSession, insertWorld } from '../../helpers/fixtures.js';

const BUDGET = 1500;
const sandbox = createTestSandbox('context-compressor-suite', { short_term_token_budget: BUDGET });
sandbox.setEnv();

after(() => {
  resetMockEnv();
  sandbox.cleanup();
});

beforeEach(() => {
  resetMockEnv();
  sandbox.writeConfig(createTestConfig({ short_term_token_budget: BUDGET, suggestion_enabled: false, memory_expansion_enabled: false }));
});

const SUMMARY = '林遥在渡口向船夫老魏借了三两银子，约定开春前还清；老魏透露北岸灯塔夜里有人点灯。未了：还老魏三两银子（第2轮）';

function seedSession(rounds, { chars = 400 } = {}) {
  const world = insertWorld(sandbox.db, { name: '渡口世界' });
  const character = insertCharacter(sandbox.db, world.id, { name: '老魏' });
  const session = insertSession(sandbox.db, { character_id: character.id, world_id: world.id });
  for (let round = 1; round <= rounds; round++) {
    insertMessage(sandbox.db, session.id, { role: 'user', content: `第${round}轮玩家行动`, created_at: round * 10 });
    insertMessage(sandbox.db, session.id, { role: 'assistant', content: `第${round}轮：${'剧'.repeat(chars)}`, created_at: round * 10 + 1 });
  }
  return session;
}

function compressCall(ranges) {
  return [{ name: 'compress', arguments: { ranges } }];
}

function blocksOf(sessionId) {
  return sandbox.db.prepare('SELECT * FROM context_blocks WHERE session_id = ? ORDER BY block_no').all(sessionId);
}

function stateOf(sessionId) {
  return sandbox.db.prepare('SELECT * FROM context_state WHERE session_id = ?').get(sessionId);
}

test('原文没超过短期预算时只做门槛判断，不调用模型', async () => {
  process.env.MOCK_LLM_COMPLETE_ERROR = '不应调用模型';
  const session = seedSession(2);
  const { maintainContext } = await freshImport('backend/memory/context/compressor.js');
  const result = await maintainContext(session.id);
  assert.equal(result.outcome, 'idle');
  assert.equal(blocksOf(session.id).length, 0);
});

test('工具提交：模型压缩建议范围，块与来源指纹、运行状态在同一次写入里落库，下一轮提示词只见摘要', async () => {
  const session = seedSession(10);
  process.env.MOCK_LLM_TOOL_TURNS_QUEUE = JSON.stringify([
    compressCall([{ start: '第1轮', end: '第5轮', topic: '渡口借银', summary: SUMMARY }]),
    '已完成',
  ]);
  const { maintainContext } = await freshImport('backend/memory/context/compressor.js');
  const result = await maintainContext(session.id);
  assert.equal(result.outcome, 'compressed');

  const [row] = blocksOf(session.id);
  assert.deepEqual([row.block_no, row.tier, row.from_round, row.to_round, row.topic, row.consumed_by, row.created_round], [1, 1, 1, 5, '渡口借银', null, 10]);
  const { loadSessionContext } = await freshImport('backend/memory/context/session-context.js');
  const ctx = loadSessionContext(session.id);
  assert.deepEqual(ctx.view.active.map((b) => b.id), [row.id]);
  assert.deepEqual(ctx.view.stale, []);
  const state = stateOf(session.id);
  assert.equal(state.last_outcome, 'compressed');
  assert.equal(state.compress_count, 1);
  assert.equal(state.next_block_no, 2);
  assert.ok(state.tokens_saved > 0);

  insertMessage(sandbox.db, session.id, { role: 'user', content: '现在去北岸', created_at: 1000 });
  const { buildPrompt } = await freshImport('backend/prompts/assembler.js');
  const prompt = await buildPrompt(session.id);
  assert.match(prompt.messages[0].content, /【第1–5轮｜渡口借银】\n林遥在渡口/);
  const history = prompt.messages.slice(1, -1).map((m) => m.content).join('\n');
  assert.doesNotMatch(history, /第[1-5]轮玩家行动/);
  assert.match(history, /第6轮玩家行动/);
});

test('工具提交被拒时报错写回模型，模型改好重交后写入', async () => {
  const session = seedSession(10);
  process.env.MOCK_LLM_TOOL_TURNS_QUEUE = JSON.stringify([
    compressCall([{ start: '第1轮', end: '第5轮', summary: '长'.repeat(900) }]),
    compressCall([{ start: '第1轮', end: '第5轮', summary: SUMMARY }]),
    '好了',
  ]);
  const { maintainContext } = await freshImport('backend/memory/context/compressor.js');
  assert.equal((await maintainContext(session.id)).outcome, 'compressed');
  assert.equal(blocksOf(session.id)[0].summary, SUMMARY);
});

test('服务拒绝工具调用时按纯文本 JSON 提交，校验通过后照常写入', async () => {
  const session = seedSession(10);
  process.env.MOCK_LLM_TOOL_TURNS_QUEUE = JSON.stringify([{ fallback: true }]);
  process.env.MOCK_LLM_COMPLETE = `\`\`\`json\n${JSON.stringify({ compress: [{ start: '1', end: '4', topic: '渡口', summary: SUMMARY }] })}\n\`\`\``;
  const { maintainContext } = await freshImport('backend/memory/context/compressor.js');
  assert.equal((await maintainContext(session.id)).outcome, 'compressed');
  assert.deepEqual(blocksOf(session.id).map((b) => [b.from_round, b.to_round]), [[1, 4]]);
});

test('纯文本提交校验失败时给一次重交机会', async () => {
  const session = seedSession(10);
  process.env.MOCK_LLM_TOOL_TURNS_QUEUE = JSON.stringify([JSON.stringify({ compress: [{ start: '1', end: '4', summary: '短' }] })]);
  process.env.MOCK_LLM_COMPLETE_QUEUE = JSON.stringify([JSON.stringify({ compress: [{ start: '1', end: '4', summary: SUMMARY }] })]);
  const { maintainContext } = await freshImport('backend/memory/context/compressor.js');
  assert.equal((await maintainContext(session.id)).outcome, 'compressed');
  assert.equal(blocksOf(session.id).length, 1);
});

test('模型决定这次不压缩：记下当时的可见量，原文没再增长一个步长前不再调用模型', async () => {
  const session = seedSession(10);
  process.env.MOCK_LLM_TOOL_TURNS_QUEUE = JSON.stringify(['这几轮都还在进行中的对峙里，暂不压缩']);
  const { maintainContext } = await freshImport('backend/memory/context/compressor.js');
  assert.equal((await maintainContext(session.id)).outcome, 'declined');
  const state = stateOf(session.id);
  assert.equal(state.last_outcome, 'declined');
  assert.match(state.last_error, /暂不压缩/);
  assert.ok(state.baseline_tokens > BUDGET);

  resetMockEnv();
  process.env.MOCK_LLM_COMPLETE_ERROR = '不应调用模型';
  assert.equal((await maintainContext(session.id)).outcome, 'idle');
});

test('模型调用出错时任务抛错、记下失败原因，不写任何块', async () => {
  const session = seedSession(10);
  process.env.MOCK_LLM_COMPLETE_ERROR = '服务暂不可用';
  const { maintainContext } = await freshImport('backend/memory/context/compressor.js');
  await assert.rejects(() => maintainContext(session.id), /服务暂不可用/);
  assert.equal(blocksOf(session.id).length, 0);
  const state = stateOf(session.id);
  assert.equal(state.last_outcome, 'failed');
  assert.match(state.last_error, /服务暂不可用/);
});

test('写入前重新校验：模型返回期间原文被改或范围被别的块占用时，不写入对不上的范围', async () => {
  const session = seedSession(10);
  const { loadSessionContext } = await freshImport('backend/memory/context/session-context.js');
  const { __testables } = await freshImport('backend/memory/context/compressor.js');
  const ctx = loadSessionContext(session.id);
  const planCtx = { units: ctx.units, view: ctx.view, protectedSet: ctx.protectedSet, shownRounds: null };
  const accepted = [];
  __testables.acceptActions([{ start: '1', end: '3', summary: SUMMARY }, { start: '4', end: '6', summary: SUMMARY }], planCtx, accepted);
  assert.equal(accepted.length, 2);

  // 模型调用期间：用户手动建了覆盖第 2 轮的块（模拟并发写入）
  insertContextBlock(sandbox.db, session.id, { from_round: 2, to_round: 2, summary: '并发写入的块' });
  const { blocks, dropped } = __testables.commitAccepted(session.id, accepted, null, 'run-concurrent');
  assert.deepEqual(blocks.map((b) => [b.fromRound, b.toRound]), [[4, 6]]);
  assert.equal(dropped, 1);
});

test('同一批提交重复写入时全部落空：已被块覆盖的轮次不能再压', async () => {
  const session = seedSession(10);
  const { loadSessionContext } = await freshImport('backend/memory/context/session-context.js');
  const { __testables } = await freshImport('backend/memory/context/compressor.js');
  const ctx = loadSessionContext(session.id);
  const accepted = [];
  __testables.acceptActions([{ start: '1', end: '3', summary: SUMMARY }], { units: ctx.units, view: ctx.view, protectedSet: ctx.protectedSet }, accepted);
  assert.equal(__testables.commitAccepted(session.id, accepted, null, 'run-a').blocks.length, 1);
  const again = __testables.commitAccepted(session.id, accepted, null, 'run-b');
  assert.deepEqual([again.blocks.length, again.dropped], [0, 1]);
  assert.equal(blocksOf(session.id).length, 1);
});

test('提炼：相邻的老一级块合成二级块，子块指向上级块；删除上级块（恢复原文）时子块重新在用', async () => {
  const session = seedSession(30, { chars: 120 });
  const children = [1, 2, 3].map((i) => insertContextBlock(sandbox.db, session.id, {
    from_round: i * 4 - 3, to_round: i * 4, created_round: i * 4, summary: `第${i}段：${'要'.repeat(380)}`,
  }));
  process.env.MOCK_LLM_TOOL_TURNS_QUEUE = JSON.stringify([
    compressCall([{ start: `b${children[0].block_no}`, end: `b${children[2].block_no}`, topic: '前情', summary: SUMMARY }]),
    '完成',
  ]);
  const { maintainContext } = await freshImport('backend/memory/context/compressor.js');
  assert.equal((await maintainContext(session.id)).outcome, 'compressed');

  const rows = blocksOf(session.id);
  const parent = rows.find((r) => r.tier === 2);
  assert.deepEqual([parent.from_round, parent.to_round], [1, 12]);
  assert.deepEqual(rows.filter((r) => r.tier === 1).map((r) => r.consumed_by), [parent.id, parent.id, parent.id]);

  const { restoreContextBlock, getContextBlockSource } = await freshImport('backend/services/context-blocks.js');
  const source = getContextBlockSource(session.id, parent.id);
  assert.deepEqual(source.children.map((c) => [c.fromRound, c.toRound]), [[1, 4], [5, 8], [9, 12]]);
  assert.deepEqual(source.rounds, []);
  const full = getContextBlockSource(session.id, parent.id, { full: true });
  assert.equal(full.rounds.length, 12);
  assert.equal(full.rounds[0].messages[0].content, '第1轮玩家行动');

  const overview = restoreContextBlock(session.id, parent.id);
  assert.deepEqual(overview.blocks.map((b) => [b.tier, b.fromRound]), [[1, 1], [1, 5], [1, 9]]);
  assert.equal(stateOf(session.id).last_outcome, 'restored');
});

test('开始时清理失效块：原文被编辑过的块删除，被它吸收的子块重新在用', async () => {
  const session = seedSession(6, { chars: 50 });
  const child = insertContextBlock(sandbox.db, session.id, { from_round: 1, to_round: 2, created_round: 2 });
  const parent = insertContextBlock(sandbox.db, session.id, { from_round: 1, to_round: 3, tier: 2, created_round: 3 });
  sandbox.db.prepare('UPDATE context_blocks SET consumed_by = ? WHERE id = ?').run(parent.id, child.id);
  sandbox.db.prepare("UPDATE messages SET content = '改过' WHERE session_id = ? AND content LIKE '第3轮：%'").run(session.id);

  process.env.MOCK_LLM_COMPLETE_ERROR = '不应调用模型';
  const { maintainContext } = await freshImport('backend/memory/context/compressor.js');
  assert.equal((await maintainContext(session.id)).outcome, 'idle');
  assert.deepEqual(blocksOf(session.id).map((r) => [r.id, r.consumed_by]), [[child.id, null]]);
});
