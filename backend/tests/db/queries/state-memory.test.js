import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport } from '../../helpers/test-env.js';
import { insertSession, insertWorld } from '../../helpers/fixtures.js';

const sandbox = createTestSandbox('query-state-memory');
sandbox.setEnv();

after(() => sandbox.cleanup());

const {
  upsertEntity,
  upsertProfileField,
  upsertDynamicState,
  closeDynamicState,
  upsertRelation,
  closeRelation,
  upsertThread,
  upsertWorldProfile,
  upsertWorldFact,
  closeWorldFact,
  closeProfileField,
  upsertPresence,
  nextEntitySeq,
  nextThreadSeq,
  nextRelationSeq,
  nextFactSeq,
  listCurrentEntities,
  getEntityDetails,
  listCurrentRelations,
  listActiveThreads,
  listThreads,
  listCurrentWorldFacts,
  getCurrentWorldProfile,
  getLatestPresence,
  getWorldProfileAtRound,
  rollbackStateMemory,
} = await freshImport('backend/db/queries/state-memory.js');
const { default: db } = await freshImport('backend/db/index.js');

function setupSession() {
  const world = insertWorld(sandbox.db);
  const session = insertSession(sandbox.db, { world_id: world.id });
  return session.id;
}

test('同一轮内多次修改实体只更新原行，不产生新版本', () => {
  const sessionId = setupSession();
  const entityId = 'entity-1';
  const seq = nextEntitySeq(sessionId);

  upsertEntity(sessionId, { entityId, seq, type: 'character', name: '沈彦', aliasesJson: '[]' }, 3);
  upsertEntity(sessionId, { entityId, seq, type: 'character', name: '沈砚', aliasesJson: '["老沈"]' }, 3);

  const rows = db.prepare(`SELECT * FROM state_entities WHERE session_id = ? AND entity_id = ?`).all(sessionId, entityId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, '沈砚');
  assert.equal(rows[0].aliases_json, '["老沈"]');
  assert.equal(rows[0].valid_from_round, 3);
  assert.equal(rows[0].valid_to_round, null);
});

test('跨轮修改实体会关闭旧行并插入新行，实体 ID 不变', () => {
  const sessionId = setupSession();
  const entityId = 'entity-2';
  const seq = nextEntitySeq(sessionId);

  upsertEntity(sessionId, { entityId, seq, type: 'character', name: '林乔', aliasesJson: '[]' }, 1);
  upsertEntity(sessionId, { entityId, seq, type: 'character', name: '林乔', aliasesJson: '[]', pinned: true }, 2);

  const rows = db.prepare(
    `SELECT * FROM state_entities WHERE session_id = ? AND entity_id = ? ORDER BY valid_from_round`,
  ).all(sessionId, entityId);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].valid_from_round, 1);
  assert.equal(rows[0].valid_to_round, 2);
  assert.equal(rows[1].valid_from_round, 2);
  assert.equal(rows[1].valid_to_round, null);
  assert.equal(rows[1].pinned, 1);
  assert.equal(rows[0].entity_id, rows[1].entity_id);
});

test('listCurrentEntities 按 seq 升序返回含 retired 的当前实体', () => {
  const sessionId = setupSession();
  upsertEntity(sessionId, { entityId: 'e-b', seq: 2, type: 'character', name: 'B' }, 1);
  upsertEntity(sessionId, { entityId: 'e-a', seq: 1, type: 'character', name: 'A' }, 1);
  upsertEntity(sessionId, { entityId: 'e-c', seq: 3, type: 'character', name: 'C', status: 'retired' }, 1);

  const entities = listCurrentEntities(sessionId);
  assert.deepEqual(entities.map((e) => e.entity_id), ['e-a', 'e-b', 'e-c']);
  assert.equal(entities[2].status, 'retired');
});

test('getEntityDetails 返回当前档案与动态状态', () => {
  const sessionId = setupSession();
  const entityId = 'entity-3';
  upsertEntity(sessionId, { entityId, seq: nextEntitySeq(sessionId), type: 'character', name: '沈彦' }, 1);
  upsertProfileField(sessionId, entityId, 'gender', '"男"', '沈彦是个男人', 1);
  upsertProfileField(sessionId, entityId, 'gender', '"女"', '沈彦其实是女人', 2);
  upsertDynamicState(sessionId, entityId, '伤势', '右臂受伤', 2);

  const details = getEntityDetails(sessionId, [entityId]);
  assert.equal(details[entityId].profile.gender.value_json, '"女"');
  assert.equal(details[entityId].profile.gender.evidence, '沈彦其实是女人');
  assert.equal(details[entityId].profile.gender.valid_from_round, 2);
  assert.equal(details[entityId].dynamic['伤势'], '右臂受伤');

  const empty = getEntityDetails(sessionId, []);
  assert.deepEqual(empty, {});
});

test('closeProfileField 关闭当前档案字段行且不插入新版本', () => {
  const sessionId = setupSession();
  const entityId = 'entity-close-profile';
  upsertProfileField(sessionId, entityId, 'gender', '"男"', '沈彦是个男人', 1);
  closeProfileField(sessionId, entityId, 'gender', 2);

  const rows = db.prepare(`SELECT * FROM state_profile_fields WHERE session_id = ? AND entity_id = ?`).all(sessionId, entityId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].valid_to_round, 2);

  const details = getEntityDetails(sessionId, [entityId]);
  assert.deepEqual(details[entityId].profile, {});
});

test('closeDynamicState 关闭当前动态状态行且不插入新版本', () => {
  const sessionId = setupSession();
  const entityId = 'entity-4';
  upsertDynamicState(sessionId, entityId, '伤势', '右臂受伤', 1);
  closeDynamicState(sessionId, entityId, '伤势', 2);

  const rows = db.prepare(`SELECT * FROM state_dynamic WHERE session_id = ? AND entity_id = ?`).all(sessionId, entityId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].valid_to_round, 2);

  const details = getEntityDetails(sessionId, [entityId]);
  assert.deepEqual(details[entityId].dynamic, {});
});

test('排他关系写入新值后旧行关闭；closeRelation 只关闭不插入新版本', () => {
  const sessionId = setupSession();
  const relationId = 'relation-1';
  const seq = nextRelationSeq(sessionId);
  upsertRelation(sessionId, { relationId, seq, subjectId: 'e-item', predicate: '持有者', objectId: 'e-old' }, 1);
  upsertRelation(sessionId, { relationId, seq, subjectId: 'e-item', predicate: '持有者', objectId: 'e-new' }, 2);

  const relations = listCurrentRelations(sessionId);
  assert.equal(relations.length, 1);
  assert.equal(relations[0].object_id, 'e-new');

  closeRelation(sessionId, relationId, 3);
  assert.equal(listCurrentRelations(sessionId).length, 0);
});

test('listCurrentRelations 按 entityIds 过滤主体或客体命中的关系', () => {
  const sessionId = setupSession();
  upsertRelation(sessionId, { relationId: 'r-1', seq: nextRelationSeq(sessionId), subjectId: 'e-a', predicate: '成员', objectId: 'e-b' }, 1);
  upsertRelation(sessionId, { relationId: 'r-2', seq: nextRelationSeq(sessionId), subjectId: 'e-c', predicate: '成员', objectId: 'e-d' }, 1);

  const filtered = listCurrentRelations(sessionId, ['e-b']);
  assert.deepEqual(filtered.map((r) => r.relation_id), ['r-1']);
});

test('事项状态更新写入新版本；listActiveThreads 只返回 active，listThreads 含已结束', () => {
  const sessionId = setupSession();
  const threadId = 'thread-1';
  const seq = nextThreadSeq(sessionId);
  upsertThread(sessionId, {
    threadId, seq, kind: '承诺', participantsJson: JSON.stringify(['e-1', 'e-2']),
    content: '三日内归还账本', status: 'active', openedRound: 1,
  }, 1);

  assert.equal(listActiveThreads(sessionId).length, 1);
  assert.equal(listActiveThreads(sessionId, ['e-2']).length, 1);
  assert.equal(listActiveThreads(sessionId, ['e-9']).length, 0);

  upsertThread(sessionId, {
    threadId, seq, kind: '承诺', participantsJson: JSON.stringify(['e-1', 'e-2']),
    content: '三日内归还账本', status: 'resolved', openedRound: 1,
  }, 4);

  assert.equal(listActiveThreads(sessionId).length, 0);
  const all = listThreads(sessionId);
  assert.equal(all.length, 1);
  assert.equal(all[0].status, 'resolved');
});

test('世界事实：新增、去重容量与移除', () => {
  const sessionId = setupSession();
  upsertWorldFact(sessionId, { factId: 'fact-1', seq: nextFactSeq(sessionId), text: '王城内禁止使用魔法', evidence: '王城颁布禁令' }, 1);
  upsertWorldFact(sessionId, { factId: 'fact-2', seq: nextFactSeq(sessionId), text: '北境已被黑潮会占领', evidence: '黑潮会占领北境' }, 2);

  const facts = listCurrentWorldFacts(sessionId);
  assert.deepEqual(facts.map((f) => f.text), ['王城内禁止使用魔法', '北境已被黑潮会占领']);

  closeWorldFact(sessionId, 'fact-1', 3);
  assert.deepEqual(listCurrentWorldFacts(sessionId).map((f) => f.text), ['北境已被黑潮会占领']);
});

test('世界档案：当前时间与地点、按轮取历史值', () => {
  const sessionId = setupSession();
  upsertWorldProfile(sessionId, 'time', '1000-03-15T08:00', null, 1);
  upsertWorldProfile(sessionId, 'location', '旧港仓库', 'entity-loc', 1);
  upsertWorldProfile(sessionId, 'time', '1000-03-16T08:00', null, 3);

  const current = getCurrentWorldProfile(sessionId);
  assert.equal(current.time, '1000-03-16T08:00');
  assert.equal(current.location, '旧港仓库');
  assert.equal(current.location_entity_id, 'entity-loc');

  assert.equal(getWorldProfileAtRound(sessionId, 'time', 1).value, '1000-03-15T08:00');
  assert.equal(getWorldProfileAtRound(sessionId, 'time', 2).value, '1000-03-15T08:00');
  assert.equal(getWorldProfileAtRound(sessionId, 'time', 3).value, '1000-03-16T08:00');
  assert.equal(getWorldProfileAtRound(sessionId, 'time', 0), null);
});

test('在场名单：同一轮覆盖写入，getLatestPresence 取最近一轮', () => {
  const sessionId = setupSession();
  upsertPresence(sessionId, 1, ['e-1', 'e-2']);
  upsertPresence(sessionId, 1, ['e-1']);
  upsertPresence(sessionId, 2, ['e-2', 'e-3']);

  const latest = getLatestPresence(sessionId);
  assert.equal(latest.round_index, 2);
  assert.deepEqual(latest.entity_ids, ['e-2', 'e-3']);

  const round1 = db.prepare(`SELECT entity_ids_json FROM state_presence WHERE session_id = ? AND round_index = 1`)
    .get(sessionId);
  assert.equal(round1.entity_ids_json, JSON.stringify(['e-1']));
});

test('getLatestPresence 无记录时返回 null', () => {
  const sessionId = setupSession();
  assert.equal(getLatestPresence(sessionId), null);
});

test('rollbackStateMemory 回滚到第 K 轮后，当前视图与第 K 轮时一致，实体 ID 保持不变', () => {
  const sessionId = setupSession();
  const entityId = 'entity-roll';
  const seq = nextEntitySeq(sessionId);
  upsertEntity(sessionId, { entityId, seq, type: 'character', name: '沈彦' }, 1);
  upsertProfileField(sessionId, entityId, 'gender', '"男"', '沈彦是个男人', 1);
  upsertRelation(sessionId, { relationId: 'r-roll', seq: nextRelationSeq(sessionId), subjectId: entityId, predicate: '成员', objectId: 'e-org' }, 1);
  upsertThread(sessionId, {
    threadId: 't-roll', seq: nextThreadSeq(sessionId), kind: '承诺', participantsJson: '[]',
    content: '第一版', status: 'active', openedRound: 1,
  }, 1);
  upsertWorldFact(sessionId, { factId: 'f-roll', seq: nextFactSeq(sessionId), text: '第一版事实', evidence: '据点' }, 1);
  upsertWorldProfile(sessionId, 'time', '1000-01-01T00:00', null, 1);
  upsertPresence(sessionId, 1, [entityId]);

  // 第 2 轮：改名、关闭关系、事项标记 resolved、新增事实、推进时间、更新在场
  upsertEntity(sessionId, { entityId, seq, type: 'character', name: '沈砚' }, 2);
  closeRelation(sessionId, 'r-roll', 2);
  upsertThread(sessionId, {
    threadId: 't-roll', seq, kind: '承诺', participantsJson: '[]',
    content: '第一版', status: 'resolved', openedRound: 1,
  }, 2);
  upsertWorldFact(sessionId, { factId: 'f-roll-2', seq: nextFactSeq(sessionId), text: '第二版事实', evidence: '据点2' }, 2);
  upsertWorldProfile(sessionId, 'time', '1000-01-02T00:00', null, 2);
  upsertPresence(sessionId, 2, [entityId, 'e-extra']);

  rollbackStateMemory(sessionId, 1);

  const entities = listCurrentEntities(sessionId);
  assert.equal(entities.length, 1);
  assert.equal(entities[0].entity_id, entityId);
  assert.equal(entities[0].name, '沈彦');

  assert.equal(listCurrentRelations(sessionId).length, 1);
  assert.equal(listCurrentRelations(sessionId)[0].relation_id, 'r-roll');

  const threads = listThreads(sessionId);
  assert.equal(threads.length, 1);
  assert.equal(threads[0].status, 'active');

  assert.deepEqual(listCurrentWorldFacts(sessionId).map((f) => f.fact_id), ['f-roll']);
  assert.equal(getCurrentWorldProfile(sessionId).time, '1000-01-01T00:00');

  const presenceAfterRollback = getLatestPresence(sessionId);
  assert.equal(presenceAfterRollback.round_index, 1);
  assert.deepEqual(presenceAfterRollback.entity_ids, [entityId]);
});

test('删除会话级联清空状态记忆各表', () => {
  const sessionId = setupSession();
  const entityId = 'entity-cascade';
  upsertEntity(sessionId, { entityId, seq: nextEntitySeq(sessionId), type: 'character', name: '沈彦' }, 1);
  upsertProfileField(sessionId, entityId, 'gender', '"男"', '沈彦是个男人', 1);
  upsertDynamicState(sessionId, entityId, '伤势', '右臂受伤', 1);
  upsertRelation(sessionId, { relationId: 'r-cascade', seq: nextRelationSeq(sessionId), subjectId: entityId, predicate: '成员', objectId: 'e-org' }, 1);
  upsertThread(sessionId, {
    threadId: 't-cascade', seq: nextThreadSeq(sessionId), kind: '承诺', participantsJson: '[]',
    content: '内容', status: 'active', openedRound: 1,
  }, 1);
  upsertWorldFact(sessionId, { factId: 'f-cascade', seq: nextFactSeq(sessionId), text: '事实', evidence: '证据' }, 1);
  upsertWorldProfile(sessionId, 'time', '1000-01-01T00:00', null, 1);
  upsertPresence(sessionId, 1, [entityId]);

  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);

  for (const table of [
    'state_entities', 'state_profile_fields', 'state_dynamic', 'state_relations',
    'state_threads', 'state_world_profile', 'state_world_facts', 'state_presence',
  ]) {
    const count = db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE session_id = ?`).get(sessionId);
    assert.equal(count.n, 0, `${table} 应在会话删除后清空`);
  }
});
