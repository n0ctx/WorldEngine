import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestConfig, createTestSandbox, freshImport, resetMockEnv } from '../helpers/test-env.js';
import { insertCharacter, insertMessage, insertSession, insertTurnRecord, insertWorld } from '../helpers/fixtures.js';

const sandbox = createTestSandbox('turn-summarizer-suite');
sandbox.setEnv();
after(() => {
  resetMockEnv();
  sandbox.cleanup();
});

test('parseSummaryPayload 解析 scene / cast / summary 并截断 cast', async () => {
  const { __testables } = await freshImport('backend/memory/turn-summarizer.js');
  const raw = [
    '```json',
    '{"scene":"图书馆","cast":["赵齐","白羽岚","甲","乙","丙"],',
    '"summary":"赵齐在图书馆提出风力发电方案，白羽岚以造价昂贵为由否决。"}',
    '```',
  ].join('\n');
  const result = __testables.parseSummaryPayload(raw);

  assert.equal(result.scene, '图书馆');
  assert.deepEqual(result.cast, ['赵齐', '白羽岚', '甲', '乙']);
  assert.match(result.summary, /风力发电/);
});

test('parseSummaryPayload 对非 JSON 输出降级为纯摘要', async () => {
  const { __testables } = await freshImport('backend/memory/turn-summarizer.js');
  const result = __testables.parseSummaryPayload('赵齐与白羽岚约定次日去林地种树。');

  assert.equal(result.summary, '赵齐与白羽岚约定次日去林地种树。');
  assert.equal(result.scene, '');
  assert.deepEqual(result.cast, []);
});

test('truncateSummaryToBudget：整行超 LONG_TERM_INDEX_MAX_TOKENS 时截断 summary 直到放得下', async () => {
  const { __testables } = await freshImport('backend/memory/turn-summarizer.js');
  const { countTokens } = await freshImport('backend/utils/token-counter.js');

  const longSummary = '赵齐与白羽岚在图书馆讨论风力发电方案的细节与后续安排。'.repeat(10);
  const truncated = __testables.truncateSummaryToBudget(12, '图书馆', ['赵齐', '白羽岚'], longSummary);

  assert.ok(truncated.length < longSummary.length);
  const line = `#12｜图书馆｜赵齐、白羽岚｜${truncated}`;
  assert.ok(countTokens(line) <= 100);
});

// ============================================================
// createTurnRecord
// ============================================================

function seedSession(patch = {}) {
  const world = insertWorld(sandbox.db, {});
  const character = insertCharacter(sandbox.db, world.id, {});
  return insertSession(sandbox.db, { character_id: character.id, mode: 'chat', ...patch });
}

function seedRound(sessionId, roundIndex, { userText = `问题${roundIndex}`, asstText = `回答${roundIndex}` } = {}) {
  insertMessage(sandbox.db, sessionId, { role: 'user', content: userText, created_at: roundIndex * 10 });
  insertMessage(sandbox.db, sessionId, { role: 'assistant', content: asstText, created_at: roundIndex * 10 + 1 });
}

test('createTurnRecord：轮号来自 splitRounds，前一轮缺记录时也不错位', async () => {
  resetMockEnv();
  sandbox.writeConfig(createTestConfig());
  const session = seedSession();
  seedRound(session.id, 1);
  seedRound(session.id, 2);

  const { createTurnRecord } = await freshImport('backend/memory/turn-summarizer.js');
  const { getAllTurnRecordsBySessionId } = await freshImport('backend/db/queries/turn-records.js');

  await createTurnRecord(session.id);

  const records = getAllTurnRecordsBySessionId(session.id);
  assert.equal(records.length, 1);
  // 没有第 1 轮的记录，round_index 仍应取自消息本身（第 2 轮），而不是「已有记录数 + 1」
  assert.equal(records[0].round_index, 2);
});

test('createTurnRecord：末尾是 user 消息（缺 assistant）时跳过，不建行', async () => {
  resetMockEnv();
  sandbox.writeConfig(createTestConfig());
  const session = seedSession();
  seedRound(session.id, 1);
  insertMessage(sandbox.db, session.id, { role: 'user', content: '追问', created_at: 30 });

  const { createTurnRecord } = await freshImport('backend/memory/turn-summarizer.js');
  const { getAllTurnRecordsBySessionId } = await freshImport('backend/db/queries/turn-records.js');

  await createTurnRecord(session.id);

  assert.equal(getAllTurnRecordsBySessionId(session.id).length, 0);
});

const MERGED_PHASE = '【第1–1轮｜不详｜庭院｜甲】\n起因：无\n经过：无\n结果：无\n变化：无';

test('createTurnRecord：中期摘要整理失败时仍建行并抛错，覆盖范围照常推进；下一次滑出时连同之前的轮次重新整理', async () => {
  resetMockEnv();
  sandbox.writeConfig(createTestConfig({ short_term_token_budget: 10 }));
  process.env.MOCK_LLM_COMPLETE_ERROR = '连接超时';

  const session = seedSession();
  for (const roundIndex of [1, 2]) {
    seedRound(session.id, roundIndex, { userText: '测'.repeat(50) });
    insertTurnRecord(sandbox.db, session.id, { round_index: roundIndex, summary: `庭院里的事${roundIndex}` });
  }
  seedRound(session.id, 3, { userText: '测'.repeat(50) });

  const { createTurnRecord } = await freshImport('backend/memory/turn-summarizer.js');
  const { getAllTurnRecordsBySessionId, updateTurnRecordIndex } = await freshImport('backend/db/queries/turn-records.js');

  await assert.rejects(() => createTurnRecord(session.id), /连接超时/);

  let records = getAllTurnRecordsBySessionId(session.id);
  assert.equal(records.length, 3);
  assert.equal(records[2].round_index, 3);
  assert.equal(records[2].middle_covered_to, 2);
  assert.equal(records[2].middle_summary, '');

  // 下一次滑出：第 1、2 轮仍在进行中的事件里，这次整理成功
  resetMockEnv();
  process.env.MOCK_LLM_COMPLETE = MERGED_PHASE;
  updateTurnRecordIndex(records[2].id, { summary: '庭院后来的事', scene: '', cast_json: null });
  seedRound(session.id, 4, { userText: '短' });

  await createTurnRecord(session.id);

  records = getAllTurnRecordsBySessionId(session.id);
  const latest = records[records.length - 1];
  assert.equal(latest.round_index, 4);
  assert.equal(latest.middle_covered_to, 3);
  assert.equal(latest.middle_summary, MERGED_PHASE);
});

test('createTurnRecord：多轮增长后 buildPrompt 的主模型历史 token 保持在短期预算附近', async () => {
  resetMockEnv();
  sandbox.writeConfig(createTestConfig({
    short_term_token_budget: 150,
    suggestion_enabled: false,
    memory_expansion_enabled: false,
  }));
  process.env.MOCK_LLM_COMPLETE = '未完';

  const session = seedSession();

  const { createTurnRecord } = await freshImport('backend/memory/turn-summarizer.js');
  for (let r = 1; r <= 5; r++) {
    seedRound(session.id, r, { userText: '测'.repeat(100), asstText: '测'.repeat(100) });
    await createTurnRecord(session.id);
  }
  insertMessage(sandbox.db, session.id, { role: 'user', content: '当前提问', created_at: 60 });

  const { buildPrompt } = await freshImport('backend/prompts/assembler.js');
  const { countMessages } = await freshImport('backend/utils/token-counter.js');
  const result = await buildPrompt(session.id);

  const historyMessages = result.messages.slice(1, -1);
  const historyTokens = countMessages(historyMessages);
  const allRoundsTokens = countMessages(
    Array.from({ length: 5 }, () => [{ content: '测'.repeat(100) }, { content: '测'.repeat(100) }]).flat(),
  );

  // 历史随轮次增长被滚动压缩，未随全部 5 轮原文线性增长
  assert.ok(historyTokens < allRoundsTokens);
  // 大致维持在短期预算附近（保留至多一整轮的超出余量）
  assert.ok(historyTokens <= 150 + 60, `historyTokens=${historyTokens} 超出预算过多`);
});

// ============================================================
// generateTurnIndex
// ============================================================

test('renderTurnIndexPrompt：写作模式标注玩家输入与正文，不残留未替换的占位符', async () => {
  const { __testables } = await freshImport('backend/memory/turn-summarizer.js');
  const prompt = __testables.renderTurnIndexPrompt(
    { userLabel: '玩家输入', assistantLabel: '正文', namingRule: '玩家扮演的主角叫"李石头"' },
    '派青奴去草原',
    '李石头命青奴北上慕兰草原。',
  );

  assert.match(prompt, /玩家输入：派青奴去草原/);
  assert.match(prompt, /正文：李石头命青奴北上慕兰草原。/);
  assert.match(prompt, /玩家扮演的主角叫"李石头"/);
  assert.doesNotMatch(prompt, /\{\{/);
});

test('generateTurnIndex：为最新一轮生成索引，写入 summary / scene / cast_json', async () => {
  resetMockEnv();
  sandbox.writeConfig(createTestConfig());
  process.env.MOCK_LLM_COMPLETE = '{"scene":"庭院","cast":["赵齐"],"summary":"赵齐在庭院里向白羽岚说明了风力发电方案的可行性。"}';

  const session = seedSession();
  seedRound(session.id, 1);

  const { createTurnRecord, generateTurnIndex } = await freshImport('backend/memory/turn-summarizer.js');
  const { getAllTurnRecordsBySessionId } = await freshImport('backend/db/queries/turn-records.js');

  await createTurnRecord(session.id);
  await generateTurnIndex(session.id);

  const [record] = getAllTurnRecordsBySessionId(session.id);
  assert.match(record.summary, /风力发电/);
  assert.equal(record.scene, '庭院');
  assert.deepEqual(JSON.parse(record.cast_json), ['赵齐']);
});

test('generateTurnIndex：调用失败或输出为空时 summary 保持空串，不写占位文本', async () => {
  resetMockEnv();
  sandbox.writeConfig(createTestConfig());
  process.env.MOCK_LLM_COMPLETE_ERROR = '连接超时';

  const session = seedSession();
  seedRound(session.id, 1);

  const { createTurnRecord, generateTurnIndex } = await freshImport('backend/memory/turn-summarizer.js');
  const { getAllTurnRecordsBySessionId } = await freshImport('backend/db/queries/turn-records.js');

  await createTurnRecord(session.id);
  await generateTurnIndex(session.id);

  let [record] = getAllTurnRecordsBySessionId(session.id);
  assert.equal(record.summary, '');

  resetMockEnv();
  process.env.MOCK_LLM_COMPLETE = '';
  await generateTurnIndex(session.id);

  [record] = getAllTurnRecordsBySessionId(session.id);
  assert.equal(record.summary, '');
});

test('generateTurnIndex：补生成最多 TURN_INDEX_BACKFILL_MAX 条更早未索引记录，从最老的开始', async () => {
  resetMockEnv();
  sandbox.writeConfig(createTestConfig());
  process.env.MOCK_LLM_COMPLETE = '{"scene":"","cast":[],"summary":"这一轮发生了简单的对话与互动，双方达成了初步共识。"}';

  const session = seedSession();
  const { createTurnRecord, generateTurnIndex } = await freshImport('backend/memory/turn-summarizer.js');
  const { getAllTurnRecordsBySessionId } = await freshImport('backend/db/queries/turn-records.js');

  for (let r = 1; r <= 5; r++) {
    seedRound(session.id, r);
    await createTurnRecord(session.id);
  }

  await generateTurnIndex(session.id);

  const records = getAllTurnRecordsBySessionId(session.id);
  const indexed = records.filter((r) => r.summary !== '').map((r) => r.round_index).sort((a, b) => a - b);
  const unindexed = records.filter((r) => r.summary === '').map((r) => r.round_index);

  // 最新一轮（5）+ 最多 3 条最早的更早未索引记录（1、2、3）被处理，第 4 轮留到下次
  assert.deepEqual(indexed, [1, 2, 3, 5]);
  assert.deepEqual(unindexed, [4]);
});

test('generateTurnIndex：记录在写入前已被删除（回滚）时更新 0 行，不报错', async () => {
  resetMockEnv();
  sandbox.writeConfig(createTestConfig());
  process.env.MOCK_LLM_COMPLETE = '{"scene":"","cast":[],"summary":"这一轮发生了简单的对话与互动，双方达成了初步共识。"}';
  process.env.MOCK_LLM_COMPLETE_DELAY_MS = '20';

  const session = seedSession();
  seedRound(session.id, 1);

  const { createTurnRecord, generateTurnIndex } = await freshImport('backend/memory/turn-summarizer.js');
  const { getAllTurnRecordsBySessionId, deleteTurnRecordsAfterRound } = await freshImport('backend/db/queries/turn-records.js');

  await createTurnRecord(session.id);

  const pending = generateTurnIndex(session.id);
  // LLM 调用尚在等待（MOCK_LLM_COMPLETE_DELAY_MS）时，记录被回滚删除
  await new Promise((resolve) => setTimeout(resolve, 5));
  deleteTurnRecordsAfterRound(session.id, 0);

  await assert.doesNotReject(pending);
  assert.equal(getAllTurnRecordsBySessionId(session.id).length, 0);
  delete process.env.MOCK_LLM_COMPLETE_DELAY_MS;
});
