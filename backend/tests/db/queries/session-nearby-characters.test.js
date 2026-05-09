import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport } from '../../helpers/test-env.js';
import { insertCharacter, insertSession, insertWorld } from '../../helpers/fixtures.js';

const sandbox = createTestSandbox('query-session-nearby-characters');
sandbox.setEnv();

after(() => sandbox.cleanup());

function makeSession(name) {
  const world = insertWorld(sandbox.db, { name: `${name}-世界` });
  const character = insertCharacter(sandbox.db, world.id, { name: `${name}-角色` });
  const session = insertSession(sandbox.db, { character_id: character.id, world_id: world.id });
  return session.id;
}

test('createNearbyCharacter + getNearbyById：默认值与字段一致', async () => {
  const sessionId = makeSession('basic');
  const { createNearbyCharacter, getNearbyById } = await freshImport('backend/db/queries/session-nearby-characters.js');

  const id = createNearbyCharacter({ sessionId, name: '张三' });
  const row = getNearbyById(id);
  assert.equal(row.id, id);
  assert.equal(row.session_id, sessionId);
  assert.equal(row.name, '张三');
  assert.equal(row.memory, '');
  assert.equal(row.is_saved, 0);
  assert.ok(typeof row.created_at === 'number');
  assert.ok(typeof row.updated_at === 'number');
});

test('getNearbyById 不存在返回 null', async () => {
  const { getNearbyById } = await freshImport('backend/db/queries/session-nearby-characters.js');
  assert.equal(getNearbyById('not-exist'), null);
});

test('UNIQUE(session_id, name) 违反时抛错', async () => {
  const sessionId = makeSession('unique');
  const { createNearbyCharacter } = await freshImport('backend/db/queries/session-nearby-characters.js');
  createNearbyCharacter({ sessionId, name: '同名' });
  assert.throws(() => createNearbyCharacter({ sessionId, name: '同名' }));
});

test('listNearbyBySessionId 返回该 session 全部，saved 在前', async () => {
  const sessionId = makeSession('list');
  const { createNearbyCharacter, listNearbyBySessionId, updateNearbyIsSaved } =
    await freshImport('backend/db/queries/session-nearby-characters.js');

  const a = createNearbyCharacter({ sessionId, name: 'A' });
  const b = createNearbyCharacter({ sessionId, name: 'B' });
  updateNearbyIsSaved(b, 1);

  const rows = listNearbyBySessionId(sessionId);
  assert.equal(rows.length, 2);
  // saved=1 的 b 排在前
  assert.equal(rows[0].id, b);
  assert.equal(rows[1].id, a);
});

test('getNearbyByName 命中与未命中', async () => {
  const sessionId = makeSession('byname');
  const { createNearbyCharacter, getNearbyByName } = await freshImport('backend/db/queries/session-nearby-characters.js');

  createNearbyCharacter({ sessionId, name: '李四' });
  assert.ok(getNearbyByName(sessionId, '李四'));
  assert.equal(getNearbyByName(sessionId, '王五'), null);
});

test('updateNearbyName / updateNearbyMemory 同步刷新 updated_at', async () => {
  const sessionId = makeSession('update');
  const { createNearbyCharacter, getNearbyById, updateNearbyName, updateNearbyMemory } =
    await freshImport('backend/db/queries/session-nearby-characters.js');

  const id = createNearbyCharacter({ sessionId, name: 'A' });
  const before = getNearbyById(id).updated_at;
  await new Promise((r) => setTimeout(r, 2));
  updateNearbyName(id, 'A2');
  updateNearbyMemory(id, '记忆 X');
  const after = getNearbyById(id);
  assert.equal(after.name, 'A2');
  assert.equal(after.memory, '记忆 X');
  assert.ok(after.updated_at >= before);
});

test('updateNearbyIsSaved 接受 truthy/falsy 都能正确转 0/1', async () => {
  const sessionId = makeSession('issaved');
  const { createNearbyCharacter, getNearbyById, updateNearbyIsSaved } =
    await freshImport('backend/db/queries/session-nearby-characters.js');

  const id = createNearbyCharacter({ sessionId, name: 'A' });
  updateNearbyIsSaved(id, true);
  assert.equal(getNearbyById(id).is_saved, 1);
  updateNearbyIsSaved(id, 0);
  assert.equal(getNearbyById(id).is_saved, 0);
  updateNearbyIsSaved(id, 'any-truthy');
  assert.equal(getNearbyById(id).is_saved, 1);
  updateNearbyIsSaved(id, null);
  assert.equal(getNearbyById(id).is_saved, 0);
});

test('deleteNearbyById 物理删除', async () => {
  const sessionId = makeSession('del');
  const { createNearbyCharacter, deleteNearbyById, getNearbyById } =
    await freshImport('backend/db/queries/session-nearby-characters.js');

  const id = createNearbyCharacter({ sessionId, name: 'X' });
  deleteNearbyById(id);
  assert.equal(getNearbyById(id), null);
});

test('deleteTransientNotInIds 保留 saved 与白名单，删除其他 transient', async () => {
  const sessionId = makeSession('cleanup');
  const { createNearbyCharacter, listNearbyBySessionId, updateNearbyIsSaved, deleteTransientNotInIds } =
    await freshImport('backend/db/queries/session-nearby-characters.js');

  const a = createNearbyCharacter({ sessionId, name: 'A' });
  const b = createNearbyCharacter({ sessionId, name: 'B' });
  const c = createNearbyCharacter({ sessionId, name: 'C' });
  updateNearbyIsSaved(a, 1);

  // 保留 b（在白名单）+ a（saved，无论是否在白名单都保留）；c 应被删
  deleteTransientNotInIds(sessionId, [b]);

  const remaining = listNearbyBySessionId(sessionId).map((r) => r.id).sort();
  assert.deepEqual(remaining, [a, b].sort());
  assert.ok(!remaining.includes(c));
});

test('deleteTransientNotInIds 空数组时删除所有 transient（保留 saved）', async () => {
  const sessionId = makeSession('cleanup-empty');
  const { createNearbyCharacter, listNearbyBySessionId, updateNearbyIsSaved, deleteTransientNotInIds } =
    await freshImport('backend/db/queries/session-nearby-characters.js');

  const a = createNearbyCharacter({ sessionId, name: 'A' });
  const b = createNearbyCharacter({ sessionId, name: 'B' });
  updateNearbyIsSaved(a, 1);

  deleteTransientNotInIds(sessionId, []);

  const remaining = listNearbyBySessionId(sessionId).map((r) => r.id);
  assert.deepEqual(remaining, [a]);
});
