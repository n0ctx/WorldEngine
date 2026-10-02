import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport } from '../helpers/test-env.js';
import { insertCharacter, insertMessage, insertPersona, insertWorld } from '../helpers/fixtures.js';

const sandbox = createTestSandbox('service-sessions-suite', {
  diary: {
    chat: { enabled: true, date_mode: 'virtual' },
    writing: { enabled: false, date_mode: 'virtual' },
  },
});
sandbox.setEnv();

after(() => sandbox.cleanup());

test('createSession 会写入 diary_date_mode 并插入角色开场白', async () => {
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

  assert.equal(dbSession.diary_date_mode, 'virtual');
  assert.deepEqual(firstMessage, { role: 'assistant', content: '欢迎来到试炼场。' });
});

test('createSession 插入开场白时替换 {{user}}/{{char}}/{{world}}', async () => {
  const world = insertWorld(sandbox.db, { name: '废土' });
  insertPersona(sandbox.db, world.id, { name: '周大壮' });
  const character = insertCharacter(sandbox.db, world.id, {
    name: '白漓',
    first_message: '（{{char}}看到{{user}}坐在{{world}}的店里）',
  });

  const { createSession } = await freshImport('backend/services/sessions.js');
  const session = createSession(character.id);

  const firstMessage = sandbox.db.prepare('SELECT content FROM messages WHERE session_id = ?').get(session.id);
  assert.equal(firstMessage.content, '（白漓看到周大壮坐在废土的店里）');
});

test('createSession / createWritingSession 开局就建好玩家与主角色实体并带入档案初始值', async () => {
  const world = insertWorld(sandbox.db, { name: '会话世界-初始值' });
  const persona = insertPersona(sandbox.db, world.id, { name: '旅人' });
  sandbox.db.prepare('UPDATE worlds SET active_persona_id = ? WHERE id = ?').run(persona.id, world.id);
  sandbox.db.prepare('UPDATE personas SET profile_defaults_json = ? WHERE id = ?').run(JSON.stringify({ gender: '女' }), persona.id);
  const character = insertCharacter(sandbox.db, world.id, { name: '洛因' });
  sandbox.db.prepare('UPDATE characters SET profile_defaults_json = ? WHERE id = ?').run(JSON.stringify({ occupation: '剑客' }), character.id);

  const { createSession } = await freshImport('backend/services/sessions.js');
  const { createWritingSession } = await freshImport('backend/services/writing-sessions.js');
  const { listCurrentEntities, getEntityDetails } = await freshImport('backend/db/queries/state-memory.js');

  const chat = createSession(character.id);
  const chatEntities = listCurrentEntities(chat.id);
  const details = getEntityDetails(chat.id, chatEntities.map((e) => e.entity_id));
  const player = chatEntities.find((e) => e.type === 'player');
  const main = chatEntities.find((e) => e.card_id === character.id);
  assert.equal(player.name, '旅人');
  assert.equal(JSON.parse(details[player.entity_id].profile.gender.value_json), '女');
  assert.equal(JSON.parse(details[main.entity_id].profile.occupation.value_json), '剑客');

  const writing = createWritingSession(world.id);
  const writingEntities = listCurrentEntities(writing.id);
  assert.deepEqual(writingEntities.map((e) => e.type), ['player']);
  const writingPlayer = getEntityDetails(writing.id, [writingEntities[0].entity_id])[writingEntities[0].entity_id];
  assert.equal(JSON.parse(writingPlayer.profile.gender.value_json), '女');
});

test('updateMessageAndDeleteAfter 会更新当前消息并删除之后消息', async () => {
  const world = insertWorld(sandbox.db, { name: '会话世界-编辑' });
  const character = insertCharacter(sandbox.db, world.id, { name: '米娅' });
  const { createSession, updateMessageAndDeleteAfter } = await freshImport('backend/services/sessions.js');
  const session = createSession(character.id);
  const first = insertMessage(sandbox.db, session.id, { role: 'user', content: '原问题', created_at: 1 });
  insertMessage(sandbox.db, session.id, { role: 'assistant', content: '旧回复', created_at: 2 });
  insertMessage(sandbox.db, session.id, { role: 'user', content: '会被删除', created_at: 3 });

  updateMessageAndDeleteAfter(first.id, '新问题');

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

  deleteMessagesAfter(first.id);
  let rows = sandbox.db.prepare(`
    SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at ASC
  `).all(session.id);
  assert.deepEqual(rows.map((row) => row.content), ['一']);

  insertMessage(sandbox.db, session.id, { role: 'assistant', content: '四', created_at: 13 });
  await deleteAllMessagesBySessionId(session.id);

  const remaining = sandbox.db.prepare('SELECT COUNT(*) AS c FROM messages WHERE session_id = ?').get(session.id).c;
  assert.equal(remaining, 0);
});
