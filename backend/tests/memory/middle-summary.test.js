import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestConfig, createTestSandbox, freshImport, resetMockEnv } from '../helpers/test-env.js';
import { insertCharacter, insertMessage, insertPersona, insertSession, insertTurnRecord, insertWorld } from '../helpers/fixtures.js';

const sandbox = createTestSandbox('middle-summary-suite');
sandbox.setEnv();

after(() => {
  resetMockEnv();
  sandbox.cleanup();
});

function round(roundIndex, messages) {
  return { roundIndex, messages };
}

function msg(role, content) {
  return { role, content };
}

// ============================================================
// planEviction（纯函数）
// ============================================================

test('planEviction：窗口总 token 不超预算时无滑出', async () => {
  const { planEviction } = await freshImport('backend/memory/middle-summary.js');
  const rounds = [
    round(1, [msg('user', 'aa'), msg('assistant', 'bb')]),
    round(2, [msg('user', 'cc'), msg('assistant', 'dd')]),
  ];
  const result = planEviction(rounds, 0, 1000, 2);

  assert.equal(result.evictedTo, 0);
  assert.equal(result.windowRounds, 2);
  assert.ok(result.windowTokens > 0);
});

test('planEviction：超过 70% 但未超预算时不滑出', async () => {
  const { planEviction } = await freshImport('backend/memory/middle-summary.js');
  // 每轮 50 个中文字符 ≈ 39 token；窗口 ≈ 79 token，超过 100 × 70% 但未超预算 100
  const mid = '测'.repeat(50);
  const rounds = [
    round(1, [msg('user', mid)]),
    round(2, [msg('user', mid)]),
    round(3, [msg('user', '短')]),
  ];
  const result = planEviction(rounds, 0, 100, 3);

  assert.equal(result.evictedTo, 0);
  assert.equal(result.windowRounds, 3);
});

test('planEviction：超预算时一次滑到预算的 70% 以内', async () => {
  const { planEviction } = await freshImport('backend/memory/middle-summary.js');
  // 窗口 ≈ 118 token 超预算 100；滑出 1 轮后 ≈ 79 仍高于 70，需再滑出 1 轮
  const mid = '测'.repeat(50);
  const rounds = [
    round(1, [msg('user', mid)]),
    round(2, [msg('user', mid)]),
    round(3, [msg('user', mid)]),
    round(4, [msg('user', '短')]),
  ];
  const result = planEviction(rounds, 0, 100, 4);

  assert.equal(result.evictedTo, 2);
  assert.equal(result.windowRounds, 2);
  assert.ok(result.windowTokens <= 70);
});

test('planEviction：一次滑出多轮', async () => {
  const { planEviction } = await freshImport('backend/memory/middle-summary.js');
  // 3 轮各 ≈50 token + 1 轮极小；预算 40 需要连续滑出前 3 轮才能落在预算内
  const big = '测'.repeat(100);
  const rounds = [
    round(1, [msg('user', big)]),
    round(2, [msg('user', big)]),
    round(3, [msg('user', big)]),
    round(4, [msg('user', '短')]),
  ];
  const result = planEviction(rounds, 0, 40, 4);

  assert.equal(result.evictedTo, 3);
  assert.equal(result.windowRounds, 1);
});

test('planEviction：第 N 轮单独超预算也保留', async () => {
  const { planEviction } = await freshImport('backend/memory/middle-summary.js');
  const big = '测'.repeat(100); // ≈ 50 token，远超预算
  const rounds = [
    round(1, [msg('user', '短')]),
    round(2, [msg('user', big)]),
  ];
  const result = planEviction(rounds, 0, 10, 2);

  assert.equal(result.evictedTo, 1);
  assert.equal(result.windowRounds, 1);
  assert.ok(result.windowTokens > 10);
});


// ============================================================
// __testables.buildMaterialItems（纯函数）
// ============================================================

test('buildMaterialItems：超过 20 轮时早期轮次用索引行，为空的索引行被跳过', async () => {
  const { __testables } = await freshImport('backend/memory/middle-summary.js');
  const evictedRounds = [];
  for (let i = 1; i <= 25; i++) {
    evictedRounds.push(round(i, [msg('user', `原文${i}`), msg('assistant', `回复${i}`)]));
  }
  const recordsByRound = new Map();
  for (let i = 1; i <= 5; i++) {
    recordsByRound.set(i, { summary: i === 3 ? '' : `索引摘要${i}` });
  }

  const items = __testables.buildMaterialItems(evictedRounds, recordsByRound, { userLabel: '玩家', assistantLabel: '角色' });

  // 25 轮中最后 20 轮（第 6~25 轮）用原文；前 5 轮（第 1~5 轮）用索引行，第 3 轮摘要为空被跳过
  // → 20 条原文 + 4 条索引行 = 24 条
  assert.equal(items.length, 24);
  assert.ok(items.some((t) => t.includes('第1轮：索引摘要1')));
  assert.ok(items.some((t) => t.includes('第2轮：索引摘要2')));
  assert.ok(!items.some((t) => t.startsWith('第3轮：')));
  assert.ok(items.some((t) => t.includes('第6轮 玩家：原文6')));
  assert.ok(items.some((t) => t.includes('第25轮 角色：回复25')));
});

// ============================================================
// resolveSpeakers
// ============================================================

test('resolveSpeakers：对话模式两边分别是玩家名与角色名', async () => {
  const world = insertWorld(sandbox.db);
  insertPersona(sandbox.db, world.id, { name: '李石头' });
  const character = insertCharacter(sandbox.db, world.id, { name: '青奴' });
  const session = insertSession(sandbox.db, { mode: 'chat', character_id: character.id });

  const { resolveSpeakers } = await freshImport('backend/memory/middle-summary.js');
  const speakers = resolveSpeakers(session);

  assert.equal(speakers.userLabel, '李石头');
  assert.equal(speakers.assistantLabel, '青奴');
  assert.match(speakers.namingRule, /用户一方称"李石头"，角色一方称"青奴"/);
});

test('resolveSpeakers：写作模式标注玩家输入与正文，主角写出名字，不再把助手一侧叫「角色」', async () => {
  const world = insertWorld(sandbox.db);
  insertPersona(sandbox.db, world.id, { name: '李石头' });
  const session = insertSession(sandbox.db, { mode: 'writing', world_id: world.id });

  const { resolveSpeakers } = await freshImport('backend/memory/middle-summary.js');
  const speakers = resolveSpeakers(session);

  assert.equal(speakers.userLabel, '玩家输入');
  assert.equal(speakers.assistantLabel, '正文');
  assert.match(speakers.namingRule, /主角叫"李石头"/);
  assert.match(speakers.namingRule, /不要用"玩家""角色""主角"这类代称/);
  assert.doesNotMatch(speakers.namingRule, /称"角色"/);
});

test('resolveSpeakers：写作模式玩家卡没有名字时不写主角名', async () => {
  const world = insertWorld(sandbox.db);
  insertPersona(sandbox.db, world.id, { name: '' });
  const session = insertSession(sandbox.db, { mode: 'writing', world_id: world.id });

  const { resolveSpeakers } = await freshImport('backend/memory/middle-summary.js');
  const speakers = resolveSpeakers(session);

  assert.doesNotMatch(speakers.namingRule, /主角叫/);
  assert.equal(speakers.assistantLabel, '正文');
});

// ============================================================
// 阶段解析与折叠计划（纯函数）
// ============================================================

function phase(from, to, body = '无') {
  return `【第${from}–${to}轮｜地点${from}｜不详】\n起因：${body}\n经过：无\n结果：无\n变化：无`;
}

/** 约 270 token 的阶段 */
function bigPhase(n) {
  return phase(n, n, '测'.repeat(330));
}

test('parseSummary：不分阶段的旧摘要整体当作前情', async () => {
  const { __testables } = await freshImport('backend/memory/middle-summary.js');
  const parsed = __testables.parseSummary('李石头测出雷灵根。\n后来入了魔焰宗。');

  assert.equal(parsed.prologue, '李石头测出雷灵根。\n后来入了魔焰宗。');
  assert.deepEqual(parsed.phases, []);
});

test('parseSummary / serializeSummary：前情与阶段拆开后原样拼回', async () => {
  const { __testables } = await freshImport('backend/memory/middle-summary.js');
  const text = `【前情】\n最早的事。\n\n${phase(1, 3)}\n\n${phase(4, 6)}`;
  const parsed = __testables.parseSummary(text);

  assert.equal(parsed.prologue, '最早的事。');
  assert.deepEqual(parsed.phases, [phase(1, 3), phase(4, 6)]);
  assert.equal(__testables.serializeSummary(parsed), text);
});

test('planFold：总长与前情都在上限内时不折叠', async () => {
  const { __testables } = await freshImport('backend/memory/middle-summary.js');
  assert.equal(__testables.planFold('前情', [phase(1, 2), phase(3, 4)]), null);
});

test('planFold：只有前情超限时返回 0，只压前情', async () => {
  const { __testables } = await freshImport('backend/memory/middle-summary.js');
  assert.equal(__testables.planFold('测'.repeat(500), [phase(1, 2)]), 0);
});

test('planFold：总长超限时从最老的阶段折起，直到剩余阶段落到余量的 60% 以内', async () => {
  const { __testables } = await freshImport('backend/memory/middle-summary.js');
  // 5 个约 270 token 的阶段 ≈ 1350 超过 1200；余量 (1200 − 360) × 0.6 = 504，需折掉前 4 个
  const phases = [1, 2, 3, 4, 5].map(bigPhase);
  assert.equal(__testables.planFold('', phases), 4);
});

test('planFold：最后一个阶段自身就超出余量时也折进前情', async () => {
  const { __testables } = await freshImport('backend/memory/middle-summary.js');
  const phases = [phase(1, 1), phase(2, 2, '测'.repeat(1600))];
  assert.equal(__testables.planFold('', phases), 2);
});

// ============================================================
// computeMiddleSummary（集成，走 mock LLM）
// ============================================================

function seedSession(patch = {}) {
  return insertSession(sandbox.db, { mode: 'chat', ...patch });
}

function seedRound(sessionId, roundIndex, { userText = `问题${roundIndex}`, asstText = `回答${roundIndex}` } = {}) {
  insertMessage(sandbox.db, sessionId, { role: 'user', content: userText, created_at: roundIndex * 10 });
  insertMessage(sandbox.db, sessionId, { role: 'assistant', content: asstText, created_at: roundIndex * 10 + 1 });
}

/** 两轮会话：第 1 轮超出预算会被滑出，第 2 轮是当前轮；可选给第 1 轮写一份已有摘要作为基线 */
function seedEvictingSession(baselineSummary = null, patch = {}) {
  const session = seedSession(patch);
  seedRound(session.id, 1, { userText: '测'.repeat(50) });
  seedRound(session.id, 2, { userText: '短' });
  if (baselineSummary != null) {
    insertTurnRecord(sandbox.db, session.id, { round_index: 1, middle_summary: baselineSummary, middle_covered_to: 0 });
  }
  return session;
}

test('computeMiddleSummary：有滑出时合并成功，coveredTo 推进', async () => {
  resetMockEnv();
  sandbox.writeConfig(createTestConfig({ short_term_token_budget: 10 }));
  process.env.MOCK_LLM_COMPLETE = phase(1, 1, '新的剧情');

  const session = seedEvictingSession();
  const { computeMiddleSummary } = await freshImport('backend/memory/middle-summary.js');
  const result = await computeMiddleSummary(session.id, 2);

  assert.equal(result.failed, false);
  assert.equal(result.coveredTo, 1);
  assert.deepEqual(result.evicted, [1, 1]);
  assert.equal(result.text, phase(1, 1, '新的剧情'));
  assert.ok(result.middleTokens > 0);
});

test('computeMiddleSummary：只改写最后一个阶段，前情与更早的阶段原样保留', async () => {
  resetMockEnv();
  sandbox.writeConfig(createTestConfig({ short_term_token_budget: 10 }));
  const baseline = `【前情】\n最早的事。\n\n${phase(1, 3, '定稿阶段')}\n\n${phase(4, 5, '进行中')}`;
  process.env.MOCK_LLM_COMPLETE = `${phase(4, 6, '进行中并收尾')}\n\n${phase(7, 7, '新阶段')}`;

  const session = seedEvictingSession(baseline);
  const { computeMiddleSummary } = await freshImport('backend/memory/middle-summary.js');
  const result = await computeMiddleSummary(session.id, 2);

  assert.equal(result.failed, false);
  assert.equal(
    result.text,
    `【前情】\n最早的事。\n\n${phase(1, 3, '定稿阶段')}\n\n${phase(4, 6, '进行中并收尾')}\n\n${phase(7, 7, '新阶段')}`,
  );
});

test('computeMiddleSummary：不分阶段的旧摘要保留为前情，新内容另起阶段', async () => {
  resetMockEnv();
  sandbox.writeConfig(createTestConfig({ short_term_token_budget: 10 }));
  process.env.MOCK_LLM_COMPLETE = phase(1, 1, '新阶段');

  const session = seedEvictingSession('旧版连续叙述的摘要。');
  const { computeMiddleSummary } = await freshImport('backend/memory/middle-summary.js');
  const result = await computeMiddleSummary(session.id, 2);

  assert.equal(result.failed, false);
  assert.equal(result.text, `【前情】\n旧版连续叙述的摘要。\n\n${phase(1, 1, '新阶段')}`);
});

test('computeMiddleSummary：输出不是阶段格式时失败，coveredTo 不推进，text 回退基线', async () => {
  resetMockEnv();
  sandbox.writeConfig(createTestConfig({ short_term_token_budget: 10 }));
  process.env.MOCK_LLM_COMPLETE = '一段没有阶段标题的叙述';

  const baseline = phase(1, 1, '已有');
  const session = seedEvictingSession(baseline);
  const { computeMiddleSummary } = await freshImport('backend/memory/middle-summary.js');
  const result = await computeMiddleSummary(session.id, 2);

  assert.equal(result.failed, true);
  assert.equal(result.error, '中期摘要格式不符');
  assert.equal(result.coveredTo, 0);
  assert.equal(result.text, baseline);
  assert.deepEqual(result.evicted, [1, 1]);
  assert.equal(result.windowRounds, 2);
});

test('computeMiddleSummary：合并输出为空时失败', async () => {
  resetMockEnv();
  sandbox.writeConfig(createTestConfig({ short_term_token_budget: 10 }));
  process.env.MOCK_LLM_COMPLETE = '';

  const session = seedEvictingSession();
  const { computeMiddleSummary } = await freshImport('backend/memory/middle-summary.js');
  const result = await computeMiddleSummary(session.id, 2);

  assert.equal(result.failed, true);
  assert.equal(result.error, '中期摘要输出为空');
  assert.equal(result.coveredTo, 0);
  assert.equal(result.text, '');
});

test('computeMiddleSummary：总长超限时把最老的阶段压进前情，保留较新的阶段', async () => {
  resetMockEnv();
  sandbox.writeConfig(createTestConfig({ short_term_token_budget: 10 }));
  const baseline = [1, 2, 3, 4].map(bigPhase).concat(phase(5, 5, '进行中')).join('\n\n');
  process.env.MOCK_LLM_COMPLETE_QUEUE = JSON.stringify([
    `${phase(5, 5, '收尾')}\n\n${bigPhase(6)}`,
    '【前情】\n浓缩后的前情',
  ]);

  const session = seedEvictingSession(baseline);
  const { computeMiddleSummary } = await freshImport('backend/memory/middle-summary.js');
  const result = await computeMiddleSummary(session.id, 2);

  assert.equal(result.failed, false);
  assert.equal(result.coveredTo, 1);
  assert.equal(result.text, `【前情】\n浓缩后的前情\n\n${phase(5, 5, '收尾')}\n\n${bigPhase(6)}`);
});

test('computeMiddleSummary：前情第一次压得超限、再压一次进上限时成功', async () => {
  resetMockEnv();
  sandbox.writeConfig(createTestConfig({ short_term_token_budget: 10 }));
  process.env.MOCK_LLM_COMPLETE_QUEUE = JSON.stringify([
    phase(1, 1, '新阶段'),
    '测'.repeat(500),
    '压进上限的前情',
  ]);

  const session = seedEvictingSession('测'.repeat(500));
  const { computeMiddleSummary } = await freshImport('backend/memory/middle-summary.js');
  const result = await computeMiddleSummary(session.id, 2);

  assert.equal(result.failed, false);
  assert.equal(result.text, `【前情】\n压进上限的前情\n\n${phase(1, 1, '新阶段')}`);
});

test('computeMiddleSummary：前情压了三次仍超限时失败，回退基线', async () => {
  resetMockEnv();
  sandbox.writeConfig(createTestConfig({ short_term_token_budget: 10 }));
  const tooLong = '测'.repeat(500);
  process.env.MOCK_LLM_COMPLETE_QUEUE = JSON.stringify([phase(1, 1, '新阶段'), tooLong, tooLong, tooLong]);

  const session = seedEvictingSession(tooLong);
  const { computeMiddleSummary } = await freshImport('backend/memory/middle-summary.js');
  const result = await computeMiddleSummary(session.id, 2);

  assert.equal(result.failed, true);
  assert.equal(result.error, '中期摘要超出长度限制');
  assert.equal(result.coveredTo, 0);
  assert.equal(result.text, tooLong);
});

test('computeMiddleSummary：LLM 调用异常时失败，回退基线', async () => {
  resetMockEnv();
  sandbox.writeConfig(createTestConfig({ short_term_token_budget: 10 }));
  process.env.MOCK_LLM_COMPLETE_ERROR = '连接超时';

  const session = seedEvictingSession();
  const { computeMiddleSummary } = await freshImport('backend/memory/middle-summary.js');
  const result = await computeMiddleSummary(session.id, 2);

  assert.equal(result.failed, true);
  assert.equal(result.error, '连接超时');
  assert.equal(result.coveredTo, 0);
  assert.equal(result.text, '');
});

test('computeMiddleSummary：旧记录 middle_covered_to 为 NULL 时按 0 处理，无滑出时原样返回', async () => {
  resetMockEnv();
  sandbox.writeConfig(createTestConfig({ short_term_token_budget: 8000 }));

  const session = seedSession();
  seedRound(session.id, 1);
  seedRound(session.id, 2);
  const { upsertTurnRecord } = await freshImport('backend/db/queries/turn-records.js');
  // 模拟旧数据：只有 summary，没有 middle_summary / middle_covered_to（存入 NULL）
  upsertTurnRecord({ session_id: session.id, round_index: 1, summary: '旧摘要' });

  const { computeMiddleSummary } = await freshImport('backend/memory/middle-summary.js');
  const result = await computeMiddleSummary(session.id, 2);

  assert.equal(result.failed, false);
  assert.equal(result.coveredTo, 0);
  assert.equal(result.text, '');
  assert.equal(result.evicted, null);
});

test('computeMiddleSummary：写作模式在 writing.short_term_token_budget 为 null 时继承顶层预算', async () => {
  resetMockEnv();
  sandbox.writeConfig(createTestConfig({
    short_term_token_budget: 10,
    writing: { short_term_token_budget: null },
  }));
  process.env.MOCK_LLM_COMPLETE = phase(1, 1, '写作模式摘要');

  const session = seedEvictingSession(null, { mode: 'writing' });
  const { computeMiddleSummary } = await freshImport('backend/memory/middle-summary.js');
  const result = await computeMiddleSummary(session.id, 2);

  // 顶层预算 10 远小于第 1 轮的 token 数，若未正确继承会导致完全不滑出
  assert.equal(result.failed, false);
  assert.equal(result.coveredTo, 1);
  assert.equal(result.text, phase(1, 1, '写作模式摘要'));
});

test('computeMiddleSummary：超过压缩输入上限时分批合并，每批收尾的阶段定稿，最后一批的末段是当前阶段', async () => {
  resetMockEnv();
  sandbox.writeConfig(createTestConfig({ short_term_token_budget: 100 }));

  const batchOutputs = Array.from({ length: 8 }, (_, i) => `${phase(i, i, `定稿${i}`)}\n\n${phase(i, i, `进行中${i}`)}`);
  process.env.MOCK_LLM_COMPLETE_QUEUE = JSON.stringify(batchOutputs);

  const session = seedSession();
  const bigContent = '测'.repeat(2000);
  const roundCount = 16;
  for (let i = 1; i <= roundCount; i++) {
    seedRound(session.id, i, { userText: bigContent, asstText: bigContent });
  }
  seedRound(session.id, roundCount + 1, { userText: '继续', asstText: '继续' });

  const { computeMiddleSummary } = await freshImport('backend/memory/middle-summary.js');
  const result = await computeMiddleSummary(session.id, roundCount + 1);

  const remaining = JSON.parse(process.env.MOCK_LLM_COMPLETE_QUEUE ?? '[]');
  const consumed = batchOutputs.length - remaining.length;

  assert.equal(result.failed, false);
  assert.equal(result.coveredTo, roundCount);
  // 材料总量远超单批上限（12000 token），必须触发至少 2 次顺序调用
  assert.ok(consumed >= 2, `期望分批产生至少 2 次调用，实际 ${consumed} 次`);
  assert.ok(consumed < batchOutputs.length, '预置的 mock 队列长度不足以覆盖全部批次');
  const expected = Array.from({ length: consumed }, (_, i) => phase(i, i, `定稿${i}`))
    .concat(phase(consumed - 1, consumed - 1, `进行中${consumed - 1}`))
    .join('\n\n');
  assert.equal(result.text, expected);
});
