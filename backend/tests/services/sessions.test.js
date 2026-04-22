import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport } from '../helpers/test-env.js';
import { insertCharacter, insertMessage, insertWorld } from '../helpers/fixtures.js';

const sandbox = createTestSandbox('service-sessions-suite', {
  diary: {
    chat: { enabled: true, date_mode: 'virtual' },
    writing: { enabled: false, date_mode: 'virtual' },
  },
});
sandbox.setEnv();

after(() => sandbox.cleanup());

test('createSession 会写入 diary_date_mode、同步 diary_time 字段并插入角色开场白', async () => {
  const world = insertWorld(sandbox.db, { name: '会话世界-创建' });
  const character = insertCharacter(sandbox.db, world.id, {
    name: '洛因',
    first_message: '欢迎来到试炼场。',
  });

  const { createSession } = await freshImport('backend/services/sessions.js');
  const session = createSession(character.id);

  const dbSession = sandbox.db.prepare('SELECT diary_date_mode FROM sessions WHERE id = ?').get(session.id);
  const firstMessage = sandbox.db.prepare(`
    SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at ASC LIMIT 1
  `).get(session.id);
  const diaryField = sandbox.db.prepare(`
    SELECT field_key, update_mode FROM world_state_fields WHERE world_id = ? AND field_key = 'diary_time'
  `).get(world.id);

  assert.equal(dbSession.diary_date_mode, 'virtual');
  assert.deepEqual(firstMessage, { role: 'assistant', content: '欢迎来到试炼场。' });
  assert.deepEqual(diaryField, { field_key: 'diary_time', update_mode: 'llm_auto' });
});

test('updateMessageAndDeleteAfter 会更新当前消息并删除之后消息', async () => {
  const world = insertWorld(sandbox.db, { name: '会话世界-编辑' });
  const character = insertCharacter(sandbox.db, world.id, { name: '米娅' });
  const { createSession, updateMessageAndDeleteAfter } = await freshImport('backend/services/sessions.js');
  const session = createSession(character.id);
  const first = insertMessage(sandbox.db, session.id, { role: 'user', content: '原问题', created_at: 1 });
  insertMessage(sandbox.db, session.id, { role: 'assistant', content: '旧回复', created_at: 2 });
  insertMessage(sandbox.db, session.id, { role: 'user', content: '会被删除', created_at: 3 });

  await updateMessageAndDeleteAfter(first.id, '新问题');

  const rows = sandbox.db.prepare(`
    SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at ASC
  `).all(session.id);
  assert.deepEqual(rows, [{ role: 'user', content: '新问题' }]);
});

test('deleteMessagesAfter 与 deleteAllMessagesBySessionId 会删除命中的后续消息', async () => {
  const world = insertWorld(sandbox.db, { name: '会话世界-删除' });
  const character = insertCharacter(sandbox.db, world.id, { name: '赫尔' });

  const { createSession, deleteMessagesAfter, deleteAllMessagesBySessionId } = await freshImport('backend/services/sessions.js');
  const session = createSession(character.id);
  const first = insertMessage(sandbox.db, session.id, { role: 'user', content: '一', created_at: 10 });
  insertMessage(sandbox.db, session.id, { role: 'assistant', content: '二', created_at: 11 });
  insertMessage(sandbox.db, session.id, { role: 'user', content: '三', created_at: 12 });

  await deleteMessagesAfter(first.id);
  let rows = sandbox.db.prepare(`
    SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at ASC
  `).all(session.id);
  assert.deepEqual(rows.map((row) => row.content), ['一']);

  insertMessage(sandbox.db, session.id, { role: 'assistant', content: '四', created_at: 13 });
  await deleteAllMessagesBySessionId(session.id);

  const remaining = sandbox.db.prepare('SELECT COUNT(*) AS c FROM messages WHERE session_id = ?').get(session.id).c;
  assert.equal(remaining, 0);
});
