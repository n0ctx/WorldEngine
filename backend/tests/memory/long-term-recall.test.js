import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport, resetMockEnv } from '../helpers/test-env.js';
import {
  insertCharacter,
  insertContextBlock,
  insertMessage,
  insertSession,
  insertTurnRecord,
  insertWorld,
} from '../helpers/fixtures.js';
import { countTokens } from '../../utils/token-counter.js';

const sandbox = createTestSandbox('long-term-recall-suite', {
  memory_expansion_enabled: true,
  writing: { memory_expansion_enabled: true },
});
sandbox.setEnv();

after(() => {
  resetMockEnv();
  sandbox.cleanup();
});

function setupSession(mode = 'chat') {
  const world = insertWorld(sandbox.db, { name: '晨曦城' });
  const character = insertCharacter(sandbox.db, world.id, { name: '莱恩' });
  const session = insertSession(sandbox.db, { character_id: character.id, world_id: world.id, mode, title: '当前会话' });
  return { world, character, session };
}

/** 写入 n 轮对话；contents[i] 可覆盖第 i+1 轮的回复正文，indexed 时同时写轮次索引 */
function seedRounds(sessionId, n, { contents = [], indexed = true } = {}) {
  for (let round = 1; round <= n; round++) {
    insertMessage(sandbox.db, sessionId, { role: 'user', content: `第${round}轮玩家发言`, created_at: round * 10 });
    insertMessage(sandbox.db, sessionId, { role: 'assistant', content: contents[round - 1] ?? `第${round}轮回复正文`, created_at: round * 10 + 1 });
    if (indexed) insertTurnRecord(sandbox.db, sessionId, { round_index: round, summary: `第${round}轮摘要` });
  }
}

async function scopeFor(sessionId, outOfViewRounds) {
  const { loadSessionContext } = await freshImport('backend/memory/context/session-context.js');
  const ctx = loadSessionContext(sessionId);
  return { units: ctx.units, outOfViewRounds: new Set(outOfViewRounds), activeBlocks: ctx.view.active, indexRows: ctx.indexRows };
}

function setIndexBudget(chat, writing = chat) {
  const next = sandbox.readConfig();
  next.long_term_index_budget = chat;
  next.writing.long_term_index_budget = writing;
  sandbox.writeConfig(next);
}

// ─── 纯函数 ───

test('renderIndexLine 按 #轮次｜场景｜人物｜摘要 拼接，空字段省略', async () => {
  const { __testables } = await freshImport('backend/memory/long-term-recall.js');
  const line = __testables.renderIndexLine({ round: 7, scene: '', cast_json: '["赵齐","白羽岚"]', summary: '两人商议下一步计划。' });
  assert.equal(line, '#7｜赵齐、白羽岚｜两人商议下一步计划。');
});

test('parseCastNames 对非法 JSON 与空值返回空数组', async () => {
  const { __testables } = await freshImport('backend/memory/long-term-recall.js');
  assert.deepEqual(__testables.parseCastNames(null), []);
  assert.deepEqual(__testables.parseCastNames('not-json'), []);
  assert.deepEqual(__testables.parseCastNames('["赵齐"," ", 1]'), ['赵齐', '1']);
});

test('selectWithinBudget 放得下时全部保留；放不下时先放与近期对话相关的，再从新到旧补满', async () => {
  const { __testables } = await freshImport('backend/memory/long-term-recall.js');
  const make = (round, text) => ({ round, line: `#${round}｜${text}`, tokens: countTokens(`#${round}｜${text}`), searchText: text });
  const candidates = [make(1, '在码头买下青铜罗盘'), make(2, '酒馆里打听消息'), make(3, '山路上躲雨'), make(4, '夜宿驿站')];
  const all = __testables.selectWithinBudget(candidates, 10_000, '罗盘');
  assert.deepEqual(all.selected.map((c) => c.round), [1, 2, 3, 4]);

  const budget = candidates[0].tokens + candidates[3].tokens;
  const picked = __testables.selectWithinBudget(candidates, budget, '那只青铜罗盘还在吗');
  assert.deepEqual(picked.selected.map((c) => c.round), [1, 4]);
  assert.equal(picked.indexTokens, budget);
});

test('pickKnownRounds 过滤未知编号、去重并保持顺序', async () => {
  const { __testables } = await freshImport('backend/memory/long-term-recall.js');
  const result = __testables.pickKnownRounds([2, 2, 5, 1, 3, 3, 3], new Set([1, 2, 3]));
  assert.deepEqual(result, [2, 1, 3]);
  assert.deepEqual(__testables.pickKnownRounds('not-array', new Set([1])), []);
});

test('目录按所属压缩块分组，组标题带块覆盖的轮次与小标题；没有索引的轮次用回复开头代替', async () => {
  const { session } = setupSession();
  seedRounds(session.id, 4, { indexed: false });
  insertTurnRecord(sandbox.db, session.id, { round_index: 1, summary: '第1轮摘要', scene: '码头' });
  insertContextBlock(sandbox.db, session.id, { from_round: 1, to_round: 2, topic: '启程' });
  const scope = await scopeFor(session.id, [1, 2, 3]);

  const { __testables } = await freshImport('backend/memory/long-term-recall.js');
  const catalog = __testables.renderCatalog(__testables.buildCandidates(scope), scope.activeBlocks);
  assert.equal(catalog, [
    '【第1–2轮·启程】',
    '#1｜码头｜第1轮摘要',
    '#2｜第2轮回复正文',
    '【暂不在上下文的原文】',
    '#3｜第3轮回复正文',
  ].join('\n'));
});

// ─── recallTurns ───

test('scope 缺失或没有不在历史里的轮次时直接返回空结果，不调用模型', async () => {
  resetMockEnv();
  process.env.MOCK_LLM_COMPLETE_ERROR = '不应调用模型';
  const { session } = setupSession();
  seedRounds(session.id, 2);
  const { recallTurns } = await freshImport('backend/memory/long-term-recall.js');
  assert.deepEqual(await recallTurns({ sessionId: session.id, mode: 'chat', scope: null }), { rounds: [], candidateCount: 0, droppedCount: 0 });
  const empty = await recallTurns({ sessionId: session.id, mode: 'chat', scope: await scopeFor(session.id, []) });
  assert.deepEqual(empty, { rounds: [], candidateCount: 0, droppedCount: 0 });
});

test('对应模式的记忆召回开关关闭时不召回', async () => {
  resetMockEnv();
  process.env.MOCK_LLM_COMPLETE = JSON.stringify({ turns: [1] });
  const { session } = setupSession('writing');
  seedRounds(session.id, 2);
  const next = sandbox.readConfig();
  next.memory_expansion_enabled = true;
  next.writing.memory_expansion_enabled = false;
  sandbox.writeConfig(next);

  const { recallTurns } = await freshImport('backend/memory/long-term-recall.js');
  const scope = await scopeFor(session.id, [1]);
  assert.deepEqual(await recallTurns({ sessionId: session.id, mode: 'writing', scope }), { rounds: [], candidateCount: 0, droppedCount: 0 });
  const chat = await recallTurns({ sessionId: session.id, mode: 'chat', scope });
  assert.deepEqual(chat.rounds, [1]);
  next.writing.memory_expansion_enabled = true;
  sandbox.writeConfig(next);
});

test('只有不在历史里的轮次是候选；模型选中候选外的编号被过滤，去重并保持模型给出的顺序', async () => {
  resetMockEnv();
  setIndexBudget(100_000);
  const { session } = setupSession();
  seedRounds(session.id, 6);
  process.env.MOCK_LLM_COMPLETE = JSON.stringify({ turns: [3, 3, 6, 1, 99] });

  const { recallTurns } = await freshImport('backend/memory/long-term-recall.js');
  const result = await recallTurns({ sessionId: session.id, mode: 'chat', scope: await scopeFor(session.id, [1, 2, 3]) });
  assert.equal(result.candidateCount, 3);
  assert.equal(result.droppedCount, 0);
  assert.deepEqual(result.rounds, [3, 1]);
});

test('写作召回使用写作目录预算', async () => {
  resetMockEnv();
  setIndexBudget(2000, 100_000);
  const { session } = setupSession('writing');
  seedRounds(session.id, 8);
  process.env.MOCK_LLM_COMPLETE = JSON.stringify({ turns: [1, 2, 3, 4, 5, 6, 7, 8] });
  const { recallTurns } = await freshImport('backend/memory/long-term-recall.js');
  const result = await recallTurns({ sessionId: session.id, mode: 'writing', scope: await scopeFor(session.id, [1, 2, 3, 4, 5, 6, 7, 8]) });
  assert.deepEqual(result.rounds, [1, 2, 3, 4, 5, 6, 7, 8]);
});

test('目录超预算时按相关度挑候选：与近期对话相关的老轮次留在目录里，未入选的轮次即使模型选了也被过滤', async () => {
  resetMockEnv();
  const { session } = setupSession();
  seedRounds(session.id, 3, { contents: ['在码头买下了青铜罗盘', '酒馆里打听消息', '山路上躲雨'] });
  const { recallTurns, __testables } = await freshImport('backend/memory/long-term-recall.js');
  const scope = await scopeFor(session.id, [1, 2, 3]);
  const lineTokens = __testables.buildCandidates(scope).map((c) => c.tokens);
  setIndexBudget(lineTokens[0]);
  process.env.MOCK_LLM_COMPLETE = JSON.stringify({ turns: [1, 2, 3] });

  const result = await recallTurns({ sessionId: session.id, mode: 'chat', scope, recentMessages: '用户：那只青铜罗盘呢？' });
  assert.equal(result.candidateCount, 3);
  assert.equal(result.droppedCount, 2);
  assert.deepEqual(result.rounds, [1]);
  setIndexBudget(20_000);
});

test('模型调用异常或输出非 JSON 时静默降级为不召回', async () => {
  resetMockEnv();
  const { session } = setupSession();
  seedRounds(session.id, 2);
  const { recallTurns } = await freshImport('backend/memory/long-term-recall.js');
  const scope = await scopeFor(session.id, [1]);
  process.env.MOCK_LLM_COMPLETE_ERROR = '召回超时';
  assert.deepEqual(await recallTurns({ sessionId: session.id, mode: 'chat', scope }), { rounds: [], candidateCount: 1, droppedCount: 0 });
  resetMockEnv();
  process.env.MOCK_LLM_COMPLETE = '这不是 JSON';
  assert.deepEqual((await recallTurns({ sessionId: session.id, mode: 'chat', scope })).rounds, []);
});

// ─── renderRecalledTurns ───

test('renderRecalledTurns 对空列表返回空文本', async () => {
  const { renderRecalledTurns } = await freshImport('backend/memory/long-term-recall.js');
  assert.deepEqual(renderRecalledTurns([], []), { text: '', hitRounds: [] });
});

test('renderRecalledTurns 按轮次升序渲染库里的原文，含日期与轮次，去掉思考过程', async () => {
  const { session } = setupSession();
  seedRounds(session.id, 5, { contents: [null, null, '<think>想想</think>说到你决定去北方森林。', null, '你抵达了森林深处。'] });
  const scope = await scopeFor(session.id, []);
  const { renderRecalledTurns } = await freshImport('backend/memory/long-term-recall.js');
  const { text, hitRounds } = renderRecalledTurns([5, 3], scope.units);

  assert.deepEqual(hitRounds, [3, 5]);
  assert.ok(text.indexOf('第3轮') < text.indexOf('第5轮'));
  assert.match(text, /【历史对话原文 · 1970-01-01 · 第3轮】/);
  assert.match(text, /\{\{user\}\}：第3轮玩家发言/);
  assert.match(text, /\{\{char\}\}：说到你决定去北方森林。/);
  assert.doesNotMatch(text, /想想/);
});

test('renderRecalledTurns 单条超预算时跳过该条，继续渲染后面未超预算的条目', async () => {
  const { session } = setupSession();
  seedRounds(session.id, 2, { contents: ['很长的历史对话内容。'.repeat(200), '你好呀'] });
  const scope = await scopeFor(session.id, []);
  const { renderRecalledTurns } = await freshImport('backend/memory/long-term-recall.js');
  const { text, hitRounds } = renderRecalledTurns([1, 2], scope.units, 40);
  assert.deepEqual(hitRounds, [2]);
  assert.doesNotMatch(text, /很长的历史对话内容/);
  assert.match(text, /你好呀/);
});
