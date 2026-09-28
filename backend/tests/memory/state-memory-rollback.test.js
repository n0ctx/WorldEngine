import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport } from '../helpers/test-env.js';
import {
  insertCharacter,
  insertMessage,
  insertSession,
  insertTurnRecord,
  insertWorld,
} from '../helpers/fixtures.js';

const sandbox = createTestSandbox('memory-state-memory-rollback-suite');
sandbox.setEnv();

after(() => sandbox.cleanup());

async function loadDeps() {
  const stateMemory = await freshImport('backend/db/queries/state-memory.js');
  const entityValues = await freshImport('backend/db/queries/session-entity-state-values.js');
  const stateRollback = await freshImport('backend/memory/state-rollback.js');
  const rollbackSessionModule = await freshImport('backend/app/shared/rollback/rollback-session.js');
  const modes = await freshImport('backend/app/modes/index.js');
  const sessionsService = await freshImport('backend/services/sessions.js');
  return { stateMemory, entityValues, stateRollback, rollbackSessionModule, modes, sessionsService };
}

test('rollbackSession 回滚后：实体改名、关系排他谓词换手、事项关闭、时间地点推进、实体字段值全部回到第 N-1 轮，实体 ID 不变', async () => {
  const {
    stateMemory: {
      upsertEntity, listCurrentEntities, upsertRelation, closeRelation, listCurrentRelations,
      upsertThread, listThreads,
      upsertWorldProfile, getCurrentWorldProfile, upsertPresence, getLatestPresence,
      nextRelationSeq, nextThreadSeq,
    },
    entityValues: { upsertEntityStateValues, getEntityStateValues },
    stateRollback: { captureFullSnapshot },
    rollbackSessionModule: { rollbackSession },
    modes: { getModeForSession },
  } = await loadDeps();

  const world = insertWorld(sandbox.db, { name: '回滚集成-世界' });
  const character = insertCharacter(sandbox.db, world.id, { name: '主角色' });
  const session = insertSession(sandbox.db, { character_id: character.id, world_id: world.id });

  // ── 第 1 轮 ──
  upsertEntity(session.id, { entityId: 'e1', seq: 1, type: 'character', name: '沈彦' }, 1);
  upsertEntity(session.id, { entityId: 'e2', seq: 2, type: 'character', name: '林乔' }, 1);
  upsertRelation(session.id, { relationId: 'r1', seq: nextRelationSeq(session.id), subjectId: 'e1', predicate: '持有者', objectId: 'e2' }, 1);
  upsertThread(session.id, {
    threadId: 't1', seq: nextThreadSeq(session.id), kind: '承诺', participantsJson: '[]',
    content: '帮她找到丢失的钥匙', status: 'active', openedRound: 1,
  }, 1);
  upsertWorldProfile(session.id, 'time', '1000-01-01T08:00', null, 1);
  upsertWorldProfile(session.id, 'location', '集市', null, 1);
  upsertPresence(session.id, 1, ['e1', 'e2']);
  upsertEntityStateValues(session.id, [{ entityId: 'e1', fieldKey: 'favor', runtimeValueJson: '3' }]);

  const snapshot1 = captureFullSnapshot(session.id, world.id, [character.id]);
  const user1 = insertMessage(sandbox.db, session.id, { role: 'user', content: 'u1', created_at: 1 });
  const asst1 = insertMessage(sandbox.db, session.id, { role: 'assistant', content: 'a1', created_at: 2 });
  insertTurnRecord(sandbox.db, session.id, {
    round_index: 1, user_message_id: user1.id, asst_message_id: asst1.id,
    state_snapshot: JSON.stringify(snapshot1),
  });

  // ── 第 2 轮：改名、关系换手（持有者是排他谓词，新关系顶替旧关系）、事项结清、
  //    时间地点推进、实体字段值变化 ──
  upsertEntity(session.id, { entityId: 'e1', seq: 1, type: 'character', name: '沈砚' }, 2);
  closeRelation(session.id, 'r1', 2);
  upsertRelation(session.id, { relationId: 'r2', seq: nextRelationSeq(session.id), subjectId: 'e1', predicate: '持有者', objectValue: '钥匙' }, 2);
  upsertThread(session.id, {
    threadId: 't1', seq: 1, kind: '承诺', participantsJson: '[]',
    content: '帮她找到丢失的钥匙', status: 'resolved', openedRound: 1,
  }, 2);
  upsertWorldProfile(session.id, 'time', '1000-01-02T09:00', null, 2);
  upsertWorldProfile(session.id, 'location', '城堡', null, 2);
  upsertPresence(session.id, 2, ['e1']);
  upsertEntityStateValues(session.id, [{ entityId: 'e1', fieldKey: 'favor', runtimeValueJson: '7' }]);

  const snapshot2 = captureFullSnapshot(session.id, world.id, [character.id]);
  const user2 = insertMessage(sandbox.db, session.id, { role: 'user', content: 'u2', created_at: 3 });
  const asst2 = insertMessage(sandbox.db, session.id, { role: 'assistant', content: 'a2', created_at: 4 });
  insertTurnRecord(sandbox.db, session.id, {
    round_index: 2, user_message_id: user2.id, asst_message_id: asst2.id,
    state_snapshot: JSON.stringify(snapshot2),
  });

  const { stateRolledBack } = await rollbackSession(
    getModeForSession(session.id),
    session.id,
    async () => {},
    { redoLatestRound: true },
  );
  assert.equal(stateRolledBack, true);

  const entities = listCurrentEntities(session.id);
  const e1 = entities.find((entity) => entity.entity_id === 'e1');
  assert.equal(e1.name, '沈彦');
  assert.equal(e1.entity_id, 'e1'); // 实体 ID 回滚前后不变

  const relations = listCurrentRelations(session.id);
  assert.deepEqual(relations.map((r) => r.relation_id), ['r1']);
  assert.equal(relations[0].object_id, 'e2');

  const threads = listThreads(session.id);
  assert.equal(threads.length, 1);
  assert.equal(threads[0].status, 'active');

  const worldProfile = getCurrentWorldProfile(session.id);
  assert.equal(worldProfile.time, '1000-01-01T08:00');
  assert.equal(worldProfile.location, '集市');

  const presence = getLatestPresence(session.id);
  assert.equal(presence.round_index, 1);
  assert.deepEqual(presence.entity_ids.sort(), ['e1', 'e2']);

  const values = getEntityStateValues(session.id, ['e1']);
  assert.deepEqual(values.e1, { favor: '3' }); // 实体字段值随轮次快照回退
});

test('删除消息后只由被删轮次产生的实体和关系消失，更早轮次的保留', async () => {
  const {
    stateMemory: {
      upsertEntity, listCurrentEntities, upsertRelation, listCurrentRelations, nextRelationSeq,
    },
    stateRollback: { captureFullSnapshot },
    rollbackSessionModule: { rollbackSession },
    modes: { getModeForSession },
    sessionsService: { deleteMessage, deleteMessagesAfter },
  } = await loadDeps();

  const world = insertWorld(sandbox.db, { name: '删除消息-世界' });
  const character = insertCharacter(sandbox.db, world.id, { name: '主角色' });
  const session = insertSession(sandbox.db, { character_id: character.id, world_id: world.id });

  // 第 1 轮：e1
  upsertEntity(session.id, { entityId: 'e1', seq: 1, type: 'character', name: '甲' }, 1);
  const snapshot1 = captureFullSnapshot(session.id, world.id, [character.id]);
  const user1 = insertMessage(sandbox.db, session.id, { role: 'user', content: 'u1', created_at: 1 });
  const asst1 = insertMessage(sandbox.db, session.id, { role: 'assistant', content: 'a1', created_at: 2 });
  insertTurnRecord(sandbox.db, session.id, {
    round_index: 1, user_message_id: user1.id, asst_message_id: asst1.id,
    state_snapshot: JSON.stringify(snapshot1),
  });

  // 第 2 轮：e2 + 关系 e1-e2
  upsertEntity(session.id, { entityId: 'e2', seq: 2, type: 'character', name: '乙' }, 2);
  upsertRelation(session.id, { relationId: 'r-2', seq: nextRelationSeq(session.id), subjectId: 'e1', predicate: '认识', objectId: 'e2' }, 2);
  const snapshot2 = captureFullSnapshot(session.id, world.id, [character.id]);
  const user2 = insertMessage(sandbox.db, session.id, { role: 'user', content: 'u2', created_at: 3 });
  const asst2 = insertMessage(sandbox.db, session.id, { role: 'assistant', content: 'a2', created_at: 4 });
  insertTurnRecord(sandbox.db, session.id, {
    round_index: 2, user_message_id: user2.id, asst_message_id: asst2.id,
    state_snapshot: JSON.stringify(snapshot2),
  });

  // 第 3 轮：e3
  upsertEntity(session.id, { entityId: 'e3', seq: 3, type: 'character', name: '丙' }, 3);
  const snapshot3 = captureFullSnapshot(session.id, world.id, [character.id]);
  const user3 = insertMessage(sandbox.db, session.id, { role: 'user', content: 'u3', created_at: 5 });
  const asst3 = insertMessage(sandbox.db, session.id, { role: 'assistant', content: 'a3', created_at: 6 });
  insertTurnRecord(sandbox.db, session.id, {
    round_index: 3, user_message_id: user3.id, asst_message_id: asst3.id,
    state_snapshot: JSON.stringify(snapshot3),
  });

  // 删除第 2 轮的用户消息：删除该消息及之后全部内容（等同 DELETE /messages/:id 路由行为）
  await rollbackSession(getModeForSession(session.id), session.id, async () => {
    await deleteMessagesAfter(user2.id);
    await deleteMessage(user2.id);
  });

  const entities = listCurrentEntities(session.id);
  assert.deepEqual(entities.map((entity) => entity.entity_id), ['e1']);

  const relations = listCurrentRelations(session.id);
  assert.deepEqual(relations, []);

  const messages = sandbox.db.prepare('SELECT role FROM messages WHERE session_id = ? ORDER BY created_at').all(session.id);
  assert.deepEqual(messages.map((m) => m.role), ['user', 'assistant']);
});

test('首轮前手动编辑（第 0 轮）在重新生成第 1 轮后保留，第 1 轮新增的内容被撤销', async () => {
  const {
    stateMemory: { upsertEntity, listCurrentEntities },
    entityValues: { upsertEntityStateValues, getEntityStateValues },
    stateRollback: { captureFullSnapshot },
    rollbackSessionModule: { rollbackSession },
    modes: { getModeForSession },
  } = await loadDeps();

  const world = insertWorld(sandbox.db, { name: '首轮前基线-世界' });
  const character = insertCharacter(sandbox.db, world.id, { name: '主角色' });
  const session = insertSession(sandbox.db, { character_id: character.id, world_id: world.id });

  // 首轮前手动编辑：记为第 0 轮
  upsertEntity(session.id, { entityId: 'e0', seq: 1, type: 'character', name: '手动预设角色' }, 0);
  upsertEntityStateValues(session.id, [{ entityId: 'e0', fieldKey: 'note', runtimeValueJson: '"预设"' }]);

  const { setSessionStateBaselineIfAbsent } = await freshImport('backend/db/queries/sessions.js');
  const baseline = captureFullSnapshot(session.id, world.id, [character.id]);
  setSessionStateBaselineIfAbsent(session.id, JSON.stringify(baseline));

  // 第 1 轮：新增实体（待被重新生成撤销），没有任何 turn record（regenerate 首轮场景），回滚只能退回基线
  upsertEntity(session.id, { entityId: 'e1', seq: 2, type: 'character', name: '第一轮新增角色' }, 1);
  insertMessage(sandbox.db, session.id, { role: 'user', content: 'u1', created_at: 1 });
  insertMessage(sandbox.db, session.id, { role: 'assistant', content: 'a1', created_at: 2 });

  const { stateRolledBack } = await rollbackSession(
    getModeForSession(session.id),
    session.id,
    async () => {},
    { redoLatestRound: true },
  );
  assert.equal(stateRolledBack, true);

  const entities = listCurrentEntities(session.id);
  assert.deepEqual(entities.map((entity) => entity.entity_id), ['e0']);
  assert.equal(entities[0].name, '手动预设角色');

  const values = getEntityStateValues(session.id, ['e0']);
  assert.deepEqual(values.e0, { note: '"预设"' });
});
