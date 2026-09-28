import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport, resetMockEnv } from '../helpers/test-env.js';
import {
  insertCharacter,
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

// ─── 纯函数单元测试（selectWithinBudget / pickKnownRounds / renderIndexLine / parseCastNames） ───

test('renderIndexLine 按 #轮次｜场景｜人物｜摘要 拼接，空字段省略', async () => {
  const { __testables } = await freshImport('backend/memory/long-term-recall.js');
  const line = __testables.renderIndexLine({
    round_index: 7,
    scene: '',
    cast_json: '["赵齐","白羽岚"]',
    summary: '两人商议下一步计划。',
  });
  assert.equal(line, '#7｜赵齐、白羽岚｜两人商议下一步计划。');
});

test('parseCastNames 对非法 JSON 与空值返回空数组', async () => {
  const { __testables } = await freshImport('backend/memory/long-term-recall.js');
  assert.deepEqual(__testables.parseCastNames(null), []);
  assert.deepEqual(__testables.parseCastNames('not-json'), []);
  assert.deepEqual(__testables.parseCastNames('["赵齐"," ", 1]'), ['赵齐', '1']);
});

test('selectWithinBudget 从最新往最旧裁剪，超预算的更早轮次记入 skippedBeforeRound', async () => {
  const { __testables } = await freshImport('backend/memory/long-term-recall.js');
  const candidates = [
    { round_index: 1, scene: '', cast_json: null, summary: '第一轮的摘要内容' },
    { round_index: 2, scene: '', cast_json: null, summary: '第二轮的摘要内容' },
    { round_index: 3, scene: '', cast_json: null, summary: '第三轮的摘要内容' },
  ];
  const lineTokens = candidates.map((c) => countTokens(__testables.renderIndexLine(c)));

  // 预算只够放最新两条
  const budgetForTwo = lineTokens[1] + lineTokens[2];
  const twoResult = __testables.selectWithinBudget(candidates, budgetForTwo);
  assert.deepEqual(twoResult.selected, [candidates[1], candidates[2]]);
  assert.equal(twoResult.skippedBeforeRound, 2);
  assert.equal(twoResult.indexTokens, budgetForTwo);

  // 预算够放全部
  const budgetForAll = lineTokens[0] + lineTokens[1] + lineTokens[2];
  const allResult = __testables.selectWithinBudget(candidates, budgetForAll);
  assert.deepEqual(allResult.selected, candidates);
  assert.equal(allResult.skippedBeforeRound, null);

  // 预算连最新一条都放不下：全部跳过，不越界访问
  const tinyBudget = lineTokens[2] - 1;
  const noneResult = __testables.selectWithinBudget(candidates, tinyBudget);
  assert.deepEqual(noneResult.selected, []);
  assert.equal(noneResult.skippedBeforeRound, 4);
  assert.equal(noneResult.indexTokens, 0);
});

test('pickKnownRounds 过滤未知编号、去重、保持顺序并截断', async () => {
  const { __testables } = await freshImport('backend/memory/long-term-recall.js');
  const known = new Set([1, 2, 3]);
  const result = __testables.pickKnownRounds([2, 2, 5, 1, 3, 3, 3], known, 3);
  assert.deepEqual(result, [2, 1, 3]);
  assert.deepEqual(__testables.pickKnownRounds('not-array', known, 3), []);
});

// ─── recallTurns 集成测试 ───

test('coveredTo 非整数时直接返回空结果，不触发模型调用', async () => {
  resetMockEnv();
  process.env.MOCK_LLM_COMPLETE = JSON.stringify({ turns: [1] });
  const { session } = setupSession();
  insertTurnRecord(sandbox.db, session.id, { round_index: 1, summary: '摘要一' });

  const { recallTurns } = await freshImport('backend/memory/long-term-recall.js');
  const result = await recallTurns({ sessionId: session.id, coveredTo: null, mode: 'chat' });
  assert.deepEqual(result, { recordIds: [], candidateCount: 0, skippedBeforeRound: null });
});

test('对应模式的记忆召回开关关闭时不召回', async () => {
  resetMockEnv();
  process.env.MOCK_LLM_COMPLETE = JSON.stringify({ turns: [1] });
  const { session } = setupSession('writing');
  insertTurnRecord(sandbox.db, session.id, { round_index: 1, summary: '摘要一' });

  const nextConfig = sandbox.readConfig();
  nextConfig.memory_expansion_enabled = true;
  nextConfig.writing.memory_expansion_enabled = false;
  sandbox.writeConfig(nextConfig);

  const { recallTurns } = await freshImport('backend/memory/long-term-recall.js');
  const writingResult = await recallTurns({ sessionId: session.id, coveredTo: 1, mode: 'writing' });
  assert.deepEqual(writingResult, { recordIds: [], candidateCount: 0, skippedBeforeRound: null });

  const chatResult = await recallTurns({ sessionId: session.id, coveredTo: 1, mode: 'chat' });
  assert.equal(chatResult.candidateCount, 1);
});

test('无候选时不调用模型直接返回空结果', async () => {
  resetMockEnv();
  process.env.MOCK_LLM_COMPLETE = JSON.stringify({ turns: [1] });
  const { session } = setupSession();
  // summary 为空字符串：未生成索引，不是候选
  insertTurnRecord(sandbox.db, session.id, { round_index: 1, summary: '' });

  const { recallTurns } = await freshImport('backend/memory/long-term-recall.js');
  const result = await recallTurns({ sessionId: session.id, coveredTo: 1, mode: 'chat' });
  assert.deepEqual(result, { recordIds: [], candidateCount: 0, skippedBeforeRound: null });
});

test('候选只取 round_index <= coveredTo 的部分；模型选中范围外编号被过滤', async () => {
  resetMockEnv();
  const { session } = setupSession();
  const r1 = insertTurnRecord(sandbox.db, session.id, { round_index: 1, summary: '第一轮摘要' });
  insertTurnRecord(sandbox.db, session.id, { round_index: 2, summary: '第二轮摘要' });
  // round 5 未被 coveredTo 覆盖，不应出现在候选里
  insertTurnRecord(sandbox.db, session.id, { round_index: 5, summary: '第五轮摘要' });

  process.env.MOCK_LLM_COMPLETE = JSON.stringify({ turns: [5, 1] });

  const nextConfig = sandbox.readConfig();
  nextConfig.long_term_index_budget = 100000;
  sandbox.writeConfig(nextConfig);

  const { recallTurns } = await freshImport('backend/memory/long-term-recall.js');
  const result = await recallTurns({ sessionId: session.id, coveredTo: 2, mode: 'chat' });

  assert.equal(result.candidateCount, 2);
  assert.equal(result.skippedBeforeRound, null);
  assert.deepEqual(result.recordIds, [r1.id]);
});

test('模型输出去重、截断到 memory_recall_max_sessions，并映射回 turn_records.id', async () => {
  resetMockEnv();
  const { session } = setupSession();
  // records[n-1] 对应 round_index = n（按 1..6 顺序插入）
  const records = [1, 2, 3, 4, 5, 6].map((n) => insertTurnRecord(sandbox.db, session.id, { round_index: n, summary: `第${n}轮摘要` }));

  process.env.MOCK_LLM_COMPLETE = JSON.stringify({ turns: [3, 3, 99, 1, 5] });

  const nextConfig = sandbox.readConfig();
  nextConfig.long_term_index_budget = 100000;
  nextConfig.memory_recall_max_sessions = 2;
  sandbox.writeConfig(nextConfig);

  const { recallTurns } = await freshImport('backend/memory/long-term-recall.js');
  const result = await recallTurns({ sessionId: session.id, coveredTo: 6, mode: 'chat' });

  assert.equal(result.candidateCount, 6);
  assert.equal(result.skippedBeforeRound, null);
  // 去重（3,3→3）、过滤未知（99）、按 max_sessions=2 截断，保留模型给出的顺序 [3, 1]
  assert.deepEqual(result.recordIds, [records[2].id, records[0].id]);
});

test('写作召回使用写作预算和轮数上限', async () => {
  resetMockEnv();
  const { session } = setupSession('writing');
  const records = [1, 2, 3].map((n) => insertTurnRecord(sandbox.db, session.id, { round_index: n, summary: `第${n}轮摘要` }));
  process.env.MOCK_LLM_COMPLETE = JSON.stringify({ turns: [1, 2, 3] });
  const nextConfig = sandbox.readConfig();
  nextConfig.long_term_index_budget = 2000;
  nextConfig.memory_recall_max_sessions = 3;
  nextConfig.writing.long_term_index_budget = 100000;
  nextConfig.writing.memory_recall_max_sessions = 1;
  nextConfig.writing.memory_expansion_enabled = true;
  sandbox.writeConfig(nextConfig);

  const { recallTurns } = await freshImport('backend/memory/long-term-recall.js');
  const result = await recallTurns({ sessionId: session.id, coveredTo: 3, mode: 'writing' });
  assert.deepEqual(result.recordIds, [records[0].id]);
});

test('候选目录超预算时只保留最近部分，更早轮次记入 skippedBeforeRound 且不可被模型选中', async () => {
  resetMockEnv();
  const { session } = setupSession();
  const records = [1, 2, 3].map((n) => insertTurnRecord(sandbox.db, session.id, { round_index: n, summary: `第${n}轮摘要内容` }));

  process.env.MOCK_LLM_COMPLETE = JSON.stringify({ turns: [1, 2, 3] });

  const { recallTurns, __testables } = await freshImport('backend/memory/long-term-recall.js');
  const lineTokens = records.map((r, i) => countTokens(__testables.renderIndexLine({
    round_index: r.round_index, scene: null, cast_json: null, summary: `第${i + 1}轮摘要内容`,
  })));
  const budgetForLastOnly = lineTokens[2];

  const nextConfig = sandbox.readConfig();
  nextConfig.long_term_index_budget = budgetForLastOnly;
  sandbox.writeConfig(nextConfig);

  const result = await recallTurns({ sessionId: session.id, coveredTo: 3, mode: 'chat' });

  assert.equal(result.candidateCount, 3);
  assert.equal(result.skippedBeforeRound, 3);
  // 模型即使返回了 1、2，也不在本轮候选里，只有 round 3 可能被选中
  assert.deepEqual(result.recordIds, [records[2].id]);
});

test('模型调用异常时静默降级为不召回', async () => {
  resetMockEnv();
  const { session } = setupSession();
  insertTurnRecord(sandbox.db, session.id, { round_index: 1, summary: '第一轮摘要' });
  process.env.MOCK_LLM_COMPLETE_ERROR = '召回超时';

  const { recallTurns } = await freshImport('backend/memory/long-term-recall.js');
  const result = await recallTurns({ sessionId: session.id, coveredTo: 1, mode: 'chat' });

  assert.deepEqual(result.recordIds, []);
  assert.equal(result.candidateCount, 1);
});

test('模型输出非 JSON 时静默降级为不召回', async () => {
  resetMockEnv();
  const { session } = setupSession();
  insertTurnRecord(sandbox.db, session.id, { round_index: 1, summary: '第一轮摘要' });
  process.env.MOCK_LLM_COMPLETE = '这不是 JSON';

  const { recallTurns } = await freshImport('backend/memory/long-term-recall.js');
  const result = await recallTurns({ sessionId: session.id, coveredTo: 1, mode: 'chat' });

  assert.deepEqual(result.recordIds, []);
  assert.equal(result.candidateCount, 1);
});

// ─── renderRecalledTurns ───

test('renderRecalledTurns 对空 recordIds 返回空文本', async () => {
  const { renderRecalledTurns } = await freshImport('backend/memory/long-term-recall.js');
  assert.deepEqual(renderRecalledTurns([]), { text: '', hitIds: [] });
});

test('renderRecalledTurns 按轮次编号升序渲染原文，格式包含日期、标题与轮次', async () => {
  const { session } = setupSession();
  const u1 = insertMessage(sandbox.db, session.id, { role: 'user', content: '我们上次说到哪了？', created_at: 10 });
  const a1 = insertMessage(sandbox.db, session.id, { role: 'assistant', content: '说到你决定去北方森林。', created_at: 11 });
  const record1 = insertTurnRecord(sandbox.db, session.id, {
    round_index: 3, summary: '摘要', user_message_id: u1.id, asst_message_id: a1.id, created_at: 12,
  });
  const u2 = insertMessage(sandbox.db, session.id, { role: 'user', content: '继续', created_at: 20 });
  const a2 = insertMessage(sandbox.db, session.id, { role: 'assistant', content: '你抵达了森林深处。', created_at: 21 });
  const record2 = insertTurnRecord(sandbox.db, session.id, {
    round_index: 5, summary: '摘要', user_message_id: u2.id, asst_message_id: a2.id, created_at: 22,
  });

  const { renderRecalledTurns } = await freshImport('backend/memory/long-term-recall.js');
  // 故意反序传入，验证渲染按 round_index 升序输出
  const { text, hitIds } = renderRecalledTurns([record2.id, record1.id]);

  assert.deepEqual(hitIds, [record1.id, record2.id]);
  assert.match(text, /第3轮/);
  assert.match(text, /第5轮/);
  assert.ok(text.indexOf('第3轮') < text.indexOf('第5轮'));
  assert.match(text, /当前会话/);
  assert.match(text, /\{\{user\}\}：我们上次说到哪了？/);
  assert.match(text, /\{\{char\}\}：说到你决定去北方森林。/);
});

test('renderRecalledTurns 单条超预算时跳过该条，继续渲染后面未超预算的条目', async () => {
  const { session } = setupSession();
  const longContent = '很长的历史对话内容。'.repeat(200);
  const uLong = insertMessage(sandbox.db, session.id, { role: 'user', content: longContent, created_at: 10 });
  const aLong = insertMessage(sandbox.db, session.id, { role: 'assistant', content: longContent, created_at: 11 });
  const overBudget = insertTurnRecord(sandbox.db, session.id, {
    round_index: 1, summary: '摘要', user_message_id: uLong.id, asst_message_id: aLong.id, created_at: 12,
  });

  const uShort = insertMessage(sandbox.db, session.id, { role: 'user', content: '你好', created_at: 20 });
  const aShort = insertMessage(sandbox.db, session.id, { role: 'assistant', content: '你好呀', created_at: 21 });
  const withinBudget = insertTurnRecord(sandbox.db, session.id, {
    round_index: 2, summary: '摘要', user_message_id: uShort.id, asst_message_id: aShort.id, created_at: 22,
  });

  const { renderRecalledTurns } = await freshImport('backend/memory/long-term-recall.js');
  const { text, hitIds } = renderRecalledTurns([overBudget.id, withinBudget.id], 30);

  assert.deepEqual(hitIds, [withinBudget.id]);
  assert.doesNotMatch(text, /很长的历史对话内容/);
  assert.match(text, /你好呀/);
});
