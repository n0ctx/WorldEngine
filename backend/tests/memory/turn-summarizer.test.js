import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestConfig, createTestSandbox, freshImport, resetMockEnv } from '../helpers/test-env.js';
import { insertCharacter, insertMessage, insertSession, insertWorld } from '../helpers/fixtures.js';

const sandbox = createTestSandbox('turn-summarizer-suite');
sandbox.setEnv();
after(() => {
  resetMockEnv();
  sandbox.cleanup();
});

test('parseSummaryPayload 解析 scene / cast / summary / memory 并截断 cast', async () => {
  const { __testables } = await freshImport('backend/memory/turn-summarizer.js');
  const raw = [
    '```json',
    '{"scene":"图书馆","cast":["赵齐","白羽岚","甲","乙","丙"],',
    '"summary":"赵齐在图书馆提出风力发电方案，白羽岚以造价昂贵为由否决。",',
    '"memory":["- [任务|P4|植树|任务完成前] 两人约定次日种树"]}',
    '```',
  ].join('\n');
  const result = __testables.parseSummaryPayload(raw);

  assert.equal(result.scene, '图书馆');
  assert.deepEqual(result.cast, ['赵齐', '白羽岚', '甲', '乙']);
  assert.match(result.summary, /风力发电/);
  assert.deepEqual(result.memoryLines, ['[任务|P4|植树|任务完成前] 两人约定次日种树']);
});

test('parseSummaryPayload 对非 JSON 输出降级为纯摘要', async () => {
  const { __testables } = await freshImport('backend/memory/turn-summarizer.js');
  const result = __testables.parseSummaryPayload('赵齐与白羽岚约定次日去林地种树。');

  assert.equal(result.summary, '赵齐与白羽岚约定次日去林地种树。');
  assert.equal(result.scene, '');
  assert.deepEqual(result.cast, []);
  assert.deepEqual(result.memoryLines, []);
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

test('createTurnRecord：中期摘要失败时仍建行并抛错，coveredTo 不推进；下一轮以此行为基线重试成功', async () => {
  resetMockEnv();
  sandbox.writeConfig(createTestConfig({ short_term_token_budget: 10 }));
  process.env.MOCK_LLM_COMPLETE_ERROR = '连接超时';

  const session = seedSession();
  seedRound(session.id, 1, { userText: '测'.repeat(50) });
  seedRound(session.id, 2, { userText: '短' });

  const { createTurnRecord } = await freshImport('backend/memory/turn-summarizer.js');
  const { getAllTurnRecordsBySessionId } = await freshImport('backend/db/queries/turn-records.js');

  await assert.rejects(() => createTurnRecord(session.id), /连接超时/);

  let records = getAllTurnRecordsBySessionId(session.id);
  assert.equal(records.length, 1);
  assert.equal(records[0].round_index, 2);
  assert.equal(records[0].middle_covered_to, 0);
  assert.equal(records[0].middle_summary, '');

  // 下一轮：以失败行（coveredTo=0）为基线重试，这次成功后应推进 coveredTo
  resetMockEnv();
  process.env.MOCK_LLM_COMPLETE = '合并后的剧情摘要';
  seedRound(session.id, 3, { userText: '短' });

  await createTurnRecord(session.id);

  records = getAllTurnRecordsBySessionId(session.id);
  assert.equal(records.length, 2);
  const latest = records[records.length - 1];
  assert.equal(latest.round_index, 3);
  assert.equal(latest.middle_covered_to, 1);
  assert.equal(latest.middle_summary, '合并后的剧情摘要');
});

test('createTurnRecord：多轮增长后 buildPrompt 的主模型历史 token 保持在短期预算附近', async () => {
  resetMockEnv();
  sandbox.writeConfig(createTestConfig({
    short_term_token_budget: 150,
    suggestion_enabled: false,
    memory_expansion_enabled: false,
  }));
  process.env.MOCK_LLM_COMPLETE = '滚动合并后的剧情摘要';

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
