import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createRouteTestContext } from '../helpers/http.js';
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
