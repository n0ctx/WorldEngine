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
// 事件解析、长度控制与注入文本（纯函数 / 只读库）
// ============================================================

function event(from, to, body = '无') {
  return `【第${from}–${to}轮｜不详｜地点${from}｜甲】\n起因：${body}\n经过：经过${from}\n结果：结果${from}\n变化：无`;
}

test('closedRoundOf：取最后一个事件的止轮；空摘要为 0；没有轮号的旧摘要视为整理到 coveredTo', async () => {
  const { closedRoundOf } = await freshImport('backend/memory/middle-summary.js');

  assert.equal(closedRoundOf(`${event(1, 3)}\n\n${event(4, 9)}`, 12), 9);
  assert.equal(closedRoundOf('', 12), 0);
  assert.equal(closedRoundOf('李石头测出雷灵根。', 12), 12);
  assert.equal(closedRoundOf(`【前情】\n最早的事。\n\n${event(5, 8)}`, 12), 8);
  assert.equal(closedRoundOf(event(1, 20), 12), 12);
});

test('parseClosedEvents：回「未完」时没有新事件', async () => {
  const { __testables } = await freshImport('backend/memory/middle-summary.js');
  assert.deepEqual(__testables.parseClosedEvents('未完', 4, 10), []);
});

test('parseClosedEvents：多个事件依次落在进行中的轮次内时原样返回', async () => {
  const { __testables } = await freshImport('backend/memory/middle-summary.js');
  const output = `${event(5, 7)}\n\n${event(8, 9)}`;
  assert.deepEqual(__testables.parseClosedEvents(output, 4, 10), [event(5, 7), event(8, 9)]);
});

test('parseClosedEvents：含最后一轮的事件当作没结束丢掉，前面的照常保留', async () => {
  const { __testables } = await freshImport('backend/memory/middle-summary.js');
  assert.deepEqual(__testables.parseClosedEvents(`${event(5, 7)}\n\n${event(8, 10)}`, 4, 10), [event(5, 7)]);
  assert.deepEqual(__testables.parseClosedEvents(event(5, 10), 4, 10), []);
});

test('parseClosedEvents：没有轮号、轮号和已整理的重叠、超出已滑出的轮次时报格式不符', async () => {
  const { __testables } = await freshImport('backend/memory/middle-summary.js');
  const cases = ['一段没有标题的叙述', event(3, 6), event(5, 11), `${event(5, 7)}\n\n${event(7, 9)}`];
  for (const output of cases) {
    assert.throws(() => __testables.parseClosedEvents(output, 4, 10), /中期摘要格式不符/);
  }
});

test('fitSummary：总长在上限内时原样保留', async () => {
  const { __testables } = await freshImport('backend/memory/middle-summary.js');
  const events = [event(1, 2), event(3, 4)];
  assert.equal(__testables.fitSummary(events), events.join('\n\n'));
});

test('fitSummary：超限时先去掉最老事件的起因与经过，够了就不再删', async () => {
  const { __testables } = await freshImport('backend/memory/middle-summary.js');
  // 每个事件约 400 token，三个约 1200 出头；去掉第一个的起因就回到上限内
  const events = [1, 2, 3].map((n) => event(n, n, '测'.repeat(500)));
  const fitted = __testables.fitSummary(events);

  assert.equal(fitted, [
    '【第1–1轮｜不详｜地点1｜甲】\n结果：结果1\n变化：无',
    events[1],
    events[2],
  ].join('\n\n'));
});

test('fitSummary：只去起因经过仍超限时删掉最老的事件，最后一个事件始终保留', async () => {
  const { __testables } = await freshImport('backend/memory/middle-summary.js');
  const longResult = (n) => `【第${n}–${n}轮｜不详｜地点｜甲】\n起因：无\n经过：无\n结果：${'测'.repeat(900)}\n变化：无`;
  const fitted = __testables.fitSummary(['【前情】\n最早的事。', longResult(1), longResult(2), longResult(3)]);

  assert.equal(fitted, longResult(3));
});

// ============================================================
// computeMiddleSummary / renderStorySummary（集成，走 mock LLM）
// ============================================================

function seedSession(patch = {}) {
  return insertSession(sandbox.db, { mode: 'chat', ...patch });
}

function seedRound(sessionId, roundIndex, { userText = `问题${roundIndex}`, asstText = `回答${roundIndex}` } = {}) {
  insertMessage(sandbox.db, sessionId, { role: 'user', content: userText, created_at: roundIndex * 10 });
  insertMessage(sandbox.db, sessionId, { role: 'assistant', content: asstText, created_at: roundIndex * 10 + 1 });
}

/**
 * 预算 10 的会话：第 1..count-1 轮内容较长、已有索引行「索引N」，第 count 轮是当前轮。
 * 计算第 count 轮时前 count-1 轮全部滑出。baseline 写在第 count-1 轮的记录上。
 */
function seedEvictingSession(count, { baseline = null, coveredTo = 0, patch = {}, unindexed = [] } = {}) {
  const session = seedSession(patch);
  for (let i = 1; i < count; i++) {
    seedRound(session.id, i, { userText: '测'.repeat(50) });
    const isLast = i === count - 1;
    insertTurnRecord(sandbox.db, session.id, {
      round_index: i,
      summary: unindexed.includes(i) ? '' : `索引${i}`,
      middle_summary: isLast ? baseline : null,
      middle_covered_to: isLast && baseline != null ? coveredTo : null,
    });
  }
  seedRound(session.id, count, { userText: '短' });
  return session;
}

test('computeMiddleSummary：滑出的轮次还在同一个事件里时只推进覆盖范围，摘要不变', async () => {
  resetMockEnv();
  sandbox.writeConfig(createTestConfig({ short_term_token_budget: 10 }));
  process.env.MOCK_LLM_COMPLETE = '未完';

  const session = seedEvictingSession(4, { baseline: event(1, 1), coveredTo: 1 });
  const { computeMiddleSummary } = await freshImport('backend/memory/middle-summary.js');
  const result = await computeMiddleSummary(session.id, 4);

  assert.equal(result.failed, false);
  assert.equal(result.coveredTo, 3);
  assert.deepEqual(result.evicted, [2, 3]);
  assert.equal(result.text, event(1, 1));
});

test('computeMiddleSummary：整理出已结束的事件时接到末尾，之后的轮次留在进行中的事件里', async () => {
  resetMockEnv();
  sandbox.writeConfig(createTestConfig({ short_term_token_budget: 10 }));
  process.env.MOCK_LLM_COMPLETE = event(2, 3, '新事件');

  const session = seedEvictingSession(6, { baseline: event(1, 1), coveredTo: 1 });
  const { computeMiddleSummary, closedRoundOf } = await freshImport('backend/memory/middle-summary.js');
  const result = await computeMiddleSummary(session.id, 6);

  assert.equal(result.failed, false);
  assert.equal(result.coveredTo, 5);
  assert.equal(result.text, `${event(1, 1)}\n\n${event(2, 3, '新事件')}`);
  assert.equal(closedRoundOf(result.text, result.coveredTo), 3);
});

test('computeMiddleSummary：旧版【前情】加阶段的摘要原样保留，从最后一个阶段之后接着整理', async () => {
  resetMockEnv();
  sandbox.writeConfig(createTestConfig({ short_term_token_budget: 10 }));
  const legacy = `【前情】\n最早的事。\n\n【第1–2轮｜地点｜一夜】\n起因：无\n经过：无\n结果：无\n变化：无`;
  process.env.MOCK_LLM_COMPLETE = event(3, 4, '新事件');

  const session = seedEvictingSession(6, { baseline: legacy, coveredTo: 2 });
  const { computeMiddleSummary } = await freshImport('backend/memory/middle-summary.js');
  const result = await computeMiddleSummary(session.id, 6);

  assert.equal(result.failed, false);
  assert.equal(result.text, `${legacy}\n\n${event(3, 4, '新事件')}`);
});

test('computeMiddleSummary：整理结果格式不符时报失败，摘要保持基线，覆盖范围照常推进', async () => {
  resetMockEnv();
  sandbox.writeConfig(createTestConfig({ short_term_token_budget: 10 }));
  process.env.MOCK_LLM_COMPLETE = '一段没有标题的叙述';

  const session = seedEvictingSession(4, { baseline: event(1, 1), coveredTo: 1 });
  const { computeMiddleSummary } = await freshImport('backend/memory/middle-summary.js');
  const result = await computeMiddleSummary(session.id, 4);

  assert.equal(result.failed, true);
  assert.equal(result.error, '中期摘要格式不符');
  assert.equal(result.coveredTo, 3);
  assert.equal(result.text, event(1, 1));
  assert.equal(result.windowRounds, 1);
});

test('computeMiddleSummary：模型调用异常时报失败，覆盖范围照常推进', async () => {
  resetMockEnv();
  sandbox.writeConfig(createTestConfig({ short_term_token_budget: 10 }));
  process.env.MOCK_LLM_COMPLETE_ERROR = '连接超时';

  const session = seedEvictingSession(3);
  const { computeMiddleSummary } = await freshImport('backend/memory/middle-summary.js');
  const result = await computeMiddleSummary(session.id, 3);

  assert.equal(result.failed, true);
  assert.match(result.error, /连接超时/);
  assert.equal(result.coveredTo, 2);
  assert.equal(result.text, '');
});

test('computeMiddleSummary：进行中只有一轮时不调用模型', async () => {
  resetMockEnv();
  sandbox.writeConfig(createTestConfig({ short_term_token_budget: 10 }));
  process.env.MOCK_LLM_COMPLETE_ERROR = '不应调用';

  const session = seedEvictingSession(2);
  const { computeMiddleSummary } = await freshImport('backend/memory/middle-summary.js');
  const result = await computeMiddleSummary(session.id, 2);

  assert.equal(result.failed, false);
  assert.equal(result.coveredTo, 1);
});

test('computeMiddleSummary：进行中的轮次都还没有索引行时不调用模型', async () => {
  resetMockEnv();
  sandbox.writeConfig(createTestConfig({ short_term_token_budget: 10 }));
  process.env.MOCK_LLM_COMPLETE_ERROR = '不应调用';

  const session = seedEvictingSession(3, { unindexed: [1, 2] });
  const { computeMiddleSummary } = await freshImport('backend/memory/middle-summary.js');
  const result = await computeMiddleSummary(session.id, 3);

  assert.equal(result.failed, false);
  assert.equal(result.coveredTo, 2);
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
  process.env.MOCK_LLM_COMPLETE = '未完';

  const session = seedEvictingSession(2, { patch: { mode: 'writing' } });
  const { computeMiddleSummary } = await freshImport('backend/memory/middle-summary.js');
  const result = await computeMiddleSummary(session.id, 2);

  // 顶层预算 10 远小于第 1 轮的 token 数，若未正确继承会导致完全不滑出
  assert.equal(result.failed, false);
  assert.equal(result.coveredTo, 1);
});

test('renderStorySummary：已结束的事件后面逐轮列出进行中的事件，没有索引行的轮次跳过', async () => {
  const session = seedEvictingSession(7, { unindexed: [5] });
  const { renderStorySummary } = await freshImport('backend/memory/middle-summary.js');

  assert.equal(
    renderStorySummary(session.id, event(1, 3), 6),
    `${event(1, 3)}\n\n【进行中的事件｜第4–6轮】\n第4轮：索引4\n第6轮：索引6`,
  );
});

test('renderStorySummary：事件都已整理或还没有滑出的轮次时只返回摘要本身', async () => {
  const session = seedEvictingSession(4);
  const { renderStorySummary } = await freshImport('backend/memory/middle-summary.js');

  assert.equal(renderStorySummary(session.id, event(1, 3), 3), event(1, 3));
  assert.equal(renderStorySummary(session.id, '', 0), '');
});

test('renderStorySummary：还没有已结束的事件时，滑出的轮次都列在进行中的事件里', async () => {
  const session = seedEvictingSession(4);
  const { renderStorySummary } = await freshImport('backend/memory/middle-summary.js');

  assert.equal(renderStorySummary(session.id, '', 3), '【进行中的事件｜第1–3轮】\n第1轮：索引1\n第2轮：索引2\n第3轮：索引3');
});
