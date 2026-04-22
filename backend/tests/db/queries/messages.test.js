import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport } from '../../helpers/test-env.js';
import { insertCharacter, insertMessage, insertSession, insertWorld } from '../../helpers/fixtures.js';

const sandbox = createTestSandbox('query-messages-suite');
sandbox.setEnv();

after(() => sandbox.cleanup());

test('messages query 会解析 attachments、更新内容并按 created_at 删除后续消息', async () => {
  const world = insertWorld(sandbox.db, { name: '消息世界-基础' });
  const character = insertCharacter(sandbox.db, world.id, { name: '一号' });
  const session = insertSession(sandbox.db, { character_id: character.id });
  const { createMessage, getMessageById, updateMessageAttachments, updateMessageContent, deleteMessagesAfter } = await freshImport('backend/db/queries/messages.js');

  const first = createMessage({
    session_id: session.id,
    role: 'user',
    content: '原消息',
    attachments: ['attachments/a.png'],
    created_at: 1,
  });
  insertMessage(sandbox.db, session.id, { role: 'assistant', content: '第二条', created_at: 2 });
  insertMessage(sandbox.db, session.id, { role: 'user', content: '第三条', created_at: 3 });

  assert.deepEqual(getMessageById(first.id).attachments, ['attachments/a.png']);
  updateMessageAttachments(first.id, ['attachments/b.png', 'attachments/c.png']);
  assert.deepEqual(getMessageById(first.id).attachments, ['attachments/b.png', 'attachments/c.png']);
  assert.equal(updateMessageContent(first.id, '改后消息').content, '改后消息');

  deleteMessagesAfter(first.id);
  const rows = sandbox.db.prepare('SELECT content FROM messages WHERE session_id = ? ORDER BY created_at ASC').all(session.id);
  assert.deepEqual(rows, [{ content: '改后消息' }]);
});

test('getUncompressedMessagesBySessionId 会返回最新 N 条未压缩消息并保持升序', async () => {
  const world = insertWorld(sandbox.db, { name: '消息世界-压缩' });
  const character = insertCharacter(sandbox.db, world.id, { name: '二号' });
  const session = insertSession(sandbox.db, { character_id: character.id });
  const { getUncompressedMessagesBySessionId } = await freshImport('backend/db/queries/messages.js');

  insertMessage(sandbox.db, session.id, { role: 'user', content: 'm1', created_at: 1 });
  insertMessage(sandbox.db, session.id, { role: 'assistant', content: 'm2', created_at: 2, is_compressed: 1 });
  insertMessage(sandbox.db, session.id, { role: 'user', content: 'm3', created_at: 3 });
  insertMessage(sandbox.db, session.id, { role: 'assistant', content: 'm4', created_at: 4 });

  const rows = getUncompressedMessagesBySessionId(session.id, 2, 0);
  assert.deepEqual(rows.map((row) => row.content), ['m3', 'm4']);
});

test('附件辅助查询会忽略非法 attachments JSON，并按 message/session/character/world 聚合', async () => {
  const world = insertWorld(sandbox.db, { name: '消息世界-附件聚合' });
  const character = insertCharacter(sandbox.db, world.id, { name: '三号' });
  const session = insertSession(sandbox.db, { character_id: character.id });
  const { getAttachmentsByMessageId, getAttachmentsByMessageIds, getAttachmentsBySessionId, getAttachmentsByCharacterId, getAttachmentsByWorldId } = await freshImport('backend/db/queries/messages.js');

  const msgA = insertMessage(sandbox.db, session.id, {
    role: 'user',
    content: 'A',
    attachments: ['attachments/a.png'],
    created_at: 10,
  });
  const msgB = insertMessage(sandbox.db, session.id, {
    role: 'assistant',
    content: 'B',
    attachments: ['attachments/b.png', 'attachments/c.pdf'],
    created_at: 11,
  });
  sandbox.db.prepare('UPDATE messages SET attachments = ? WHERE id = ?').run('not-json', msgB.id);

  assert.deepEqual(getAttachmentsByMessageId(msgA.id), ['attachments/a.png']);
  assert.deepEqual(getAttachmentsByMessageIds([msgA.id, msgB.id]), ['attachments/a.png']);
  assert.deepEqual(getAttachmentsBySessionId(session.id), ['attachments/a.png']);
  assert.deepEqual(getAttachmentsByCharacterId(character.id), ['attachments/a.png']);
  assert.deepEqual(getAttachmentsByWorldId(world.id), ['attachments/a.png']);
});
