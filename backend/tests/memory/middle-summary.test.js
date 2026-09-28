import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestConfig, createTestSandbox, freshImport, resetMockEnv } from '../helpers/test-env.js';
import { insertMessage, insertSession } from '../helpers/fixtures.js';

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

test('planEviction：超预算只滑出最老的完整轮次', async () => {
  const { planEviction } = await freshImport('backend/memory/middle-summary.js');
  // 每轮 100 个中文字符 ≈ 50 token；滑出最老 1 轮后剩余 51 token，落在预算 60 以内即停
  const big = '测'.repeat(100);
  const rounds = [
    round(1, [msg('user', big)]),
    round(2, [msg('user', big)]),
    round(3, [msg('user', '短')]),
  ];
  const result = planEviction(rounds, 0, 60, 3);

  assert.equal(result.evictedTo, 1);
  assert.equal(result.windowRounds, 2);
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

  const items = __testables.buildMaterialItems(evictedRounds, recordsByRound, '玩家', '角色');

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
// computeMiddleSummary（集成，走 mock LLM）
// ============================================================

function seedSession(patch = {}) {
  return insertSession(sandbox.db, { mode: 'chat', ...patch });
}

function seedRound(sessionId, roundIndex, { userText = `问题${roundIndex}`, asstText = `回答${roundIndex}` } = {}) {
  insertMessage(sandbox.db, sessionId, { role: 'user', content: userText, created_at: roundIndex * 10 });
  insertMessage(sandbox.db, sessionId, { role: 'assistant', content: asstText, created_at: roundIndex * 10 + 1 });
}

test('computeMiddleSummary：有滑出时合并成功，coveredTo 推进', async () => {
  resetMockEnv();
  sandbox.writeConfig(createTestConfig({ short_term_token_budget: 10 }));
  process.env.MOCK_LLM_COMPLETE = '新的剧情摘要';

  const session = seedSession();
  seedRound(session.id, 1, { userText: '测'.repeat(50) });
  seedRound(session.id, 2, { userText: '短' });

  const { computeMiddleSummary } = await freshImport('backend/memory/middle-summary.js');
  const result = await computeMiddleSummary(session.id, 2);

  assert.equal(result.failed, false);
  assert.equal(result.coveredTo, 1);
  assert.deepEqual(result.evicted, [1, 1]);
  assert.equal(result.text, '新的剧情摘要');
  assert.equal(result.windowRounds, 1);
});

test('computeMiddleSummary：输出超过 1000 token 时二次压缩成功', async () => {
  resetMockEnv();
  sandbox.writeConfig(createTestConfig({ short_term_token_budget: 10 }));
  const tooLong = '测'.repeat(2100); // ≈ 1050 token，超过 MIDDLE_SUMMARY_MAX_TOKENS
  const shrunk = '压缩后的摘要';
  process.env.MOCK_LLM_COMPLETE_QUEUE = JSON.stringify([tooLong, shrunk]);

  const session = seedSession();
  seedRound(session.id, 1, { userText: '测'.repeat(50) });
  seedRound(session.id, 2, { userText: '短' });

  const { computeMiddleSummary } = await freshImport('backend/memory/middle-summary.js');
  const result = await computeMiddleSummary(session.id, 2);

  assert.equal(result.failed, false);
  assert.equal(result.coveredTo, 1);
  assert.equal(result.text, shrunk);
});

test('computeMiddleSummary：二次压缩仍超长时失败，coveredTo 不推进，text 回退基线', async () => {
  resetMockEnv();
  sandbox.writeConfig(createTestConfig({ short_term_token_budget: 10 }));
  const tooLong1 = '测'.repeat(2100);
  const tooLong2 = '测'.repeat(2100);
  process.env.MOCK_LLM_COMPLETE_QUEUE = JSON.stringify([tooLong1, tooLong2]);

  const session = seedSession();
  seedRound(session.id, 1, { userText: '测'.repeat(50) });
  seedRound(session.id, 2, { userText: '短' });

  const { computeMiddleSummary } = await freshImport('backend/memory/middle-summary.js');
  const result = await computeMiddleSummary(session.id, 2);

  assert.equal(result.failed, true);
  assert.ok(result.error);
  assert.equal(result.coveredTo, 0);
  assert.equal(result.text, '');
  assert.deepEqual(result.evicted, [1, 1]);
});

test('computeMiddleSummary：二次压缩输出为空时失败', async () => {
  resetMockEnv();
  sandbox.writeConfig(createTestConfig({ short_term_token_budget: 10 }));
  const tooLong = '测'.repeat(2100);
  process.env.MOCK_LLM_COMPLETE_QUEUE = JSON.stringify([tooLong, '']);

  const session = seedSession();
  seedRound(session.id, 1, { userText: '测'.repeat(50) });
  seedRound(session.id, 2, { userText: '短' });

  const { computeMiddleSummary } = await freshImport('backend/memory/middle-summary.js');
  const result = await computeMiddleSummary(session.id, 2);

  assert.equal(result.failed, true);
  assert.equal(result.coveredTo, 0);
  assert.equal(result.text, '');
});

test('computeMiddleSummary：LLM 调用异常时失败，回退基线', async () => {
  resetMockEnv();
  sandbox.writeConfig(createTestConfig({ short_term_token_budget: 10 }));
  process.env.MOCK_LLM_COMPLETE_ERROR = '连接超时';

  const session = seedSession();
  seedRound(session.id, 1, { userText: '测'.repeat(50) });
  seedRound(session.id, 2, { userText: '短' });

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
  process.env.MOCK_LLM_COMPLETE = '写作模式摘要';

  const session = seedSession({ mode: 'writing' });
  seedRound(session.id, 1, { userText: '测'.repeat(50) });
  seedRound(session.id, 2, { userText: '短' });

  const { computeMiddleSummary } = await freshImport('backend/memory/middle-summary.js');
  const result = await computeMiddleSummary(session.id, 2);

  // 顶层预算 10 远小于第 1 轮的 token 数，若未正确继承会导致完全不滑出
  assert.equal(result.failed, false);
  assert.equal(result.coveredTo, 1);
  assert.equal(result.text, '写作模式摘要');
});

test('computeMiddleSummary：超过压缩输入上限时分批合并，前一批输出作为下一批旧摘要', async () => {
  resetMockEnv();
  sandbox.writeConfig(createTestConfig({ short_term_token_budget: 100 }));

  const sentinels = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛'];
  process.env.MOCK_LLM_COMPLETE_QUEUE = JSON.stringify(sentinels);

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
  const consumed = sentinels.length - remaining.length;

  assert.equal(result.failed, false);
  assert.equal(result.coveredTo, roundCount);
  // 材料总量远超单批上限（12000 token），必须触发至少 2 次顺序调用
  assert.ok(consumed >= 2, `期望分批产生至少 2 次调用，实际 ${consumed} 次`);
  assert.ok(consumed <= sentinels.length, '预置的 mock 队列长度不足以覆盖全部批次');
  assert.equal(result.text, sentinels[consumed - 1]);
});
