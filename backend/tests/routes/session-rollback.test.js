import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createRouteTestContext } from '../helpers/http.js';
import { freshImport } from '../helpers/test-env.js';
import {
  insertCharacter,
  insertDailyEntry,
  insertMessage,
  insertSession,
  insertSessionWorldStateValue,
  insertTurnRecord,
  insertWorld,
} from '../helpers/fixtures.js';

const ctx = createRouteTestContext('routes-session-rollback-suite');
after(() => ctx.close());

function sessionWorldValues(sessionId) {
  return Object.fromEntries(
    ctx.sandbox.db.prepare('SELECT field_key, runtime_value_json FROM session_world_state_values WHERE session_id = ?')
      .all(sessionId)
      .map((row) => [row.field_key, row.runtime_value_json]),
  );
}

function worldSnapshot(world) {
  return JSON.stringify({ world, persona: {}, character: {}, nearby: [] });
}

test('PUT /api/messages/:id 编辑首轮用户消息时状态回到首轮前基线', async () => {
  const world = insertWorld(ctx.sandbox.db, { name: 'edit-baseline-世界' });
  const character = insertCharacter(ctx.sandbox.db, world.id, { name: 'edit-baseline-角色' });
  const session = insertSession(ctx.sandbox.db, { character_id: character.id, world_id: world.id });
  ctx.sandbox.db.prepare('UPDATE sessions SET state_baseline_json = ? WHERE id = ?')
    .run(worldSnapshot({ mood: '"平静"' }), session.id);
  insertSessionWorldStateValue(ctx.sandbox.db, session.id, world.id, { field_key: 'mood', runtime_value_json: '"暴怒"' });
  const firstUser = insertMessage(ctx.sandbox.db, session.id, { role: 'user', content: 'u1', created_at: 1 });
  insertMessage(ctx.sandbox.db, session.id, { role: 'assistant', content: 'a1', created_at: 2 });
  insertTurnRecord(ctx.sandbox.db, session.id, { round_index: 1, state_snapshot: worldSnapshot({ mood: '"暴怒"' }) });

  const res = await ctx.request(`/api/messages/${firstUser.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: 'u1 new' }),
  });

  assert.equal(res.status, 200);
  assert.equal((await res.json()).content, 'u1 new');
  assert.deepEqual(sessionWorldValues(session.id), { mood: '"平静"' });
});

test('PUT /api/messages/:id 写作会话按会话所属世界回滚状态', async () => {
  const world = insertWorld(ctx.sandbox.db, { name: 'edit-writing-世界' });
  const session = insertSession(ctx.sandbox.db, { world_id: world.id, mode: 'writing' });
  insertSessionWorldStateValue(ctx.sandbox.db, session.id, world.id, { field_key: 'weather', runtime_value_json: '"暴雨"' });
  insertMessage(ctx.sandbox.db, session.id, { role: 'user', content: 'u1', created_at: 1 });
  insertMessage(ctx.sandbox.db, session.id, { role: 'assistant', content: 'a1', created_at: 2 });
  const secondUser = insertMessage(ctx.sandbox.db, session.id, { role: 'user', content: 'u2', created_at: 3 });
  insertMessage(ctx.sandbox.db, session.id, { role: 'assistant', content: 'a2', created_at: 4 });
  insertTurnRecord(ctx.sandbox.db, session.id, { round_index: 1, state_snapshot: worldSnapshot({ weather: '"晴"' }) });
  insertTurnRecord(ctx.sandbox.db, session.id, { round_index: 2, state_snapshot: worldSnapshot({ weather: '"暴雨"' }) });

  const res = await ctx.request(`/api/messages/${secondUser.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: 'u2 new' }),
  });

  assert.equal(res.status, 200);
  assert.deepEqual(sessionWorldValues(session.id), { weather: '"晴"' });
});

test('DELETE /api/sessions/:sessionId/messages/:messageId 保留完整轮次，删掉被删轮次的轮次记录与日记', async () => {
  const world = insertWorld(ctx.sandbox.db, { name: 'delete-round-世界' });
  const character = insertCharacter(ctx.sandbox.db, world.id, { name: 'delete-round-角色' });
  const session = insertSession(ctx.sandbox.db, { character_id: character.id, world_id: world.id });
  insertSessionWorldStateValue(ctx.sandbox.db, session.id, world.id, { field_key: 'mood', runtime_value_json: '"暴怒"' });
  insertMessage(ctx.sandbox.db, session.id, { role: 'user', content: 'u1', created_at: 1 });
  insertMessage(ctx.sandbox.db, session.id, { role: 'assistant', content: 'a1', created_at: 2 });
  const secondUser = insertMessage(ctx.sandbox.db, session.id, { role: 'user', content: 'u2', created_at: 3 });
  insertMessage(ctx.sandbox.db, session.id, { role: 'assistant', content: 'a2', created_at: 4 });
  insertTurnRecord(ctx.sandbox.db, session.id, { round_index: 1, state_snapshot: worldSnapshot({ mood: '"平静"' }) });
  insertTurnRecord(ctx.sandbox.db, session.id, { round_index: 2, state_snapshot: worldSnapshot({ mood: '"暴怒"' }) });
  insertDailyEntry(ctx.sandbox.db, session.id, { date_str: '1000-01-01', triggered_by_round_index: 1 });
  insertDailyEntry(ctx.sandbox.db, session.id, { date_str: '1000-01-02', triggered_by_round_index: 2 });
  const diaryDir = path.join(ctx.sandbox.root, 'daily', session.id);
  fs.mkdirSync(diaryDir, { recursive: true });
  fs.writeFileSync(path.join(diaryDir, '1000-01-01.md'), 'd1', 'utf-8');
  fs.writeFileSync(path.join(diaryDir, '1000-01-02.md'), 'd2', 'utf-8');

  const res = await ctx.request(`/api/sessions/${session.id}/messages/${secondUser.id}`, { method: 'DELETE' });

  assert.equal(res.status, 200);
  const rounds = ctx.sandbox.db.prepare('SELECT round_index FROM turn_records WHERE session_id = ?').all(session.id);
  assert.deepEqual(rounds.map((r) => r.round_index), [1]);
  const diaries = ctx.sandbox.db.prepare('SELECT date_str FROM daily_entries WHERE session_id = ?').all(session.id);
  assert.deepEqual(diaries.map((d) => d.date_str), ['1000-01-01']);
  assert.equal(fs.existsSync(path.join(diaryDir, '1000-01-01.md')), true);
  assert.equal(fs.existsSync(path.join(diaryDir, '1000-01-02.md')), false);
  assert.deepEqual(sessionWorldValues(session.id), { mood: '"平静"' });
});

test('rollbackSession redoLatestRound=true：末尾是 AI 回复也把最后一轮算作待重做（回到 N-1 轮）', async () => {
  const { rollbackSession } = await freshImport('backend/app/shared/rollback/rollback-session.js');
  const { getModeForSession } = await freshImport('backend/app/modes/index.js');

  const world = insertWorld(ctx.sandbox.db, { name: 'redo-round-世界' });
  const character = insertCharacter(ctx.sandbox.db, world.id, { name: 'redo-round-角色' });
  const session = insertSession(ctx.sandbox.db, { character_id: character.id, world_id: world.id });
  const firstUser = insertMessage(ctx.sandbox.db, session.id, { role: 'user', content: 'u1', created_at: 1 });
  const firstAsst = insertMessage(ctx.sandbox.db, session.id, { role: 'assistant', content: 'a1', created_at: 2 });
  const secondUser = insertMessage(ctx.sandbox.db, session.id, { role: 'user', content: 'u2', created_at: 3 });
  const secondAsst = insertMessage(ctx.sandbox.db, session.id, { role: 'assistant', content: 'a2', created_at: 4 });
  insertTurnRecord(ctx.sandbox.db, session.id, {
    round_index: 1,
    summary: 'round1 摘要',
    user_message_id: firstUser.id,
    asst_message_id: firstAsst.id,
    state_snapshot: worldSnapshot({ mood: '"平静"' }),
    middle_summary: '第一轮中期摘要',
    middle_covered_to: 1,
  });
  insertTurnRecord(ctx.sandbox.db, session.id, {
    round_index: 2,
    summary: 'round2 摘要',
    user_message_id: secondUser.id,
    asst_message_id: secondAsst.id,
    state_snapshot: worldSnapshot({ mood: '"暴怒"' }),
    middle_summary: '第一轮中期摘要 + 第二轮内容',
    middle_covered_to: 2,
  });

  const { stateRolledBack } = await rollbackSession(
    getModeForSession(session.id),
    session.id,
    async () => {},
    { redoLatestRound: true },
  );

  assert.equal(stateRolledBack, true);
  // 消息本身没有被截断（截断由 truncateMessages 回调负责，这里传的是空实现），
  // 但最后一轮的 turn record 被删掉、状态回到第一轮
  const messages = ctx.sandbox.db.prepare('SELECT id, role FROM messages WHERE session_id = ? ORDER BY created_at').all(session.id);
  assert.deepEqual(messages.map((m) => m.role), ['user', 'assistant', 'user', 'assistant']);

  const rounds = ctx.sandbox.db.prepare('SELECT round_index, user_message_id, asst_message_id, middle_summary, middle_covered_to FROM turn_records WHERE session_id = ? ORDER BY round_index').all(session.id);
  assert.deepEqual(rounds.map((r) => r.round_index), [1]);
  assert.equal(rounds[0].user_message_id, firstUser.id);
  assert.equal(rounds[0].asst_message_id, firstAsst.id);
  assert.equal(rounds[0].middle_summary, '第一轮中期摘要');
  assert.equal(rounds[0].middle_covered_to, 1);
  assert.deepEqual(sessionWorldValues(session.id), { mood: '"平静"' });
});

test('rollbackSession redoLatestRound=true：被删轮次不再是召回候选（AC-12/13）', async () => {
  const { rollbackSession } = await freshImport('backend/app/shared/rollback/rollback-session.js');
  const { getModeForSession } = await freshImport('backend/app/modes/index.js');
  const { getRecallIndexCandidates } = await freshImport('backend/db/queries/turn-records.js');

  const world = insertWorld(ctx.sandbox.db, { name: 'redo-recall-世界' });
  const character = insertCharacter(ctx.sandbox.db, world.id, { name: 'redo-recall-角色' });
  const session = insertSession(ctx.sandbox.db, { character_id: character.id, world_id: world.id });
  insertMessage(ctx.sandbox.db, session.id, { role: 'user', content: 'u1', created_at: 1 });
  insertMessage(ctx.sandbox.db, session.id, { role: 'assistant', content: 'a1', created_at: 2 });
  insertMessage(ctx.sandbox.db, session.id, { role: 'user', content: 'u2', created_at: 3 });
  insertMessage(ctx.sandbox.db, session.id, { role: 'assistant', content: 'a2', created_at: 4 });
  insertTurnRecord(ctx.sandbox.db, session.id, { round_index: 1, summary: 'round1 摘要', middle_covered_to: 1 });
  insertTurnRecord(ctx.sandbox.db, session.id, { round_index: 2, summary: 'round2 摘要', middle_covered_to: 2 });

  await rollbackSession(
    getModeForSession(session.id),
    session.id,
    async () => {},
    { redoLatestRound: true },
  );

  // 被删掉的第二轮不再作为召回候选出现，即使拿一个足够大的 coveredTo 去查
  const candidates = getRecallIndexCandidates(session.id, 999);
  assert.deepEqual(candidates.map((c) => c.round_index), [1]);
});
