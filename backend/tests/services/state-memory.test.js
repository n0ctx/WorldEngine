import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport } from '../helpers/test-env.js';
import {
  insertWorld, insertCharacter, insertSession, insertMessage, insertCharacterStateField,
} from '../helpers/fixtures.js';

const sandbox = createTestSandbox('service-state-memory');
sandbox.setEnv();

after(() => sandbox.cleanup());

const {
  getStateMemory, createEntity, updateEntity, retireEntity, updateEntityField, updateWorld,
  createRelation, deleteRelation, createThread, updateThread,
  applyEntityBasicPatch, applyManualProfilePatch, applyManualDynamicPatch,
} = await freshImport('backend/services/state-memory.js');
const { upsertPresence, listCurrentEntities } = await freshImport('backend/db/queries/state-memory.js');

function setupSession(patch = {}) {
  const world = insertWorld(sandbox.db, patch.world);
  const character = insertCharacter(sandbox.db, world.id, { name: '沈彦' });
  const session = insertSession(sandbox.db, { world_id: world.id, mode: 'writing', ...patch.session });
  return { world, character, session };
}

function expectError(fn, code) {
  try {
    fn();
    assert.fail('expected error to be thrown');
  } catch (err) {
    assert.equal(err.code, code);
  }
}

test('createEntity 成功建立实体，重名 409，未知类型 400', () => {
  const { session } = setupSession();
  const entity = createEntity(session.id, { type: 'character', name: '林乔', aliases: ['小乔'], pinned: true });
  assert.equal(entity.name, '林乔');
  assert.deepEqual(entity.aliases, ['小乔']);
  assert.equal(entity.pinned, true);
  assert.equal(entity.status, 'active');

  expectError(() => createEntity(session.id, { type: 'character', name: '林乔' }), 'conflict');
  expectError(() => createEntity(session.id, { type: 'not-a-type', name: 'X' }), 'bad_request');
  expectError(() => createEntity('no-such-session', { type: 'character', name: 'Y' }), 'not_found');
});

test('手动编辑记在当前最新一轮：无消息时记为第 0 轮，有消息时记为最后一轮', () => {
  const { session } = setupSession();
  const noRoundEntity = createEntity(session.id, { type: 'location', name: '旧港仓库' });
  const noRoundDetail = updateEntity(session.id, noRoundEntity.entity_id, { profile: { category: '仓库' } });
  assert.equal(noRoundDetail.profile.category.round, 0);
  assert.equal(noRoundDetail.profile.category.evidence, '手动编辑');

  insertMessage(sandbox.db, session.id, { role: 'user', content: '第一轮用户消息' });
  insertMessage(sandbox.db, session.id, { role: 'assistant', content: '第一轮回复' });
  insertMessage(sandbox.db, session.id, { role: 'user', content: '第二轮用户消息' });

  const withRoundDetail = updateEntity(session.id, noRoundEntity.entity_id, { profile: { category: '要塞' } });
  assert.equal(withRoundDetail.profile.category.round, 2);
});

test('updateEntity 改名冲突 409，档案停用字段拒绝，profile/dynamic 支持删除', () => {
  const { session } = setupSession();
  const a = createEntity(session.id, { type: 'character', name: 'A' });
  const b = createEntity(session.id, { type: 'character', name: 'B' });

  expectError(() => updateEntity(session.id, b.entity_id, { name: 'A' }), 'conflict');
  expectError(() => updateEntity(session.id, b.entity_id, { profile: { not_a_field: 'x' } }), 'bad_request');

  const withGender = updateEntity(session.id, b.entity_id, { profile: { gender: '女' }, dynamic: { 伤势: '轻伤' } });
  assert.equal(withGender.profile.gender.value, '女');
  assert.equal(withGender.dynamic.伤势, '轻伤');

  const cleared = updateEntity(session.id, b.entity_id, { profile: { gender: null }, dynamic: { 伤势: null } });
  assert.equal(cleared.profile.gender, undefined);
  assert.equal(cleared.dynamic.伤势, undefined);
});

test('世界里有 nearby_enabled 的「职业」角色字段时 occupation 停用，PATCH 该档案字段 400', () => {
  const { world, session } = setupSession();
  insertCharacterStateField(sandbox.db, world.id, { field_key: 'job_char', label: '职业' });

  const entity = createEntity(session.id, { type: 'character', name: '沈彦' });
  assert.ok(!entity.activeProfileFields.includes('occupation'));

  expectError(() => updateEntity(session.id, entity.entity_id, { profile: { occupation: '铁匠' } }), 'bad_request');
});

test('retireEntity 标记 retired 并关闭其参与的关系', () => {
  const { session } = setupSession();
  const a = createEntity(session.id, { type: 'character', name: 'A' });
  const b = createEntity(session.id, { type: 'character', name: 'B' });
  createRelation(session.id, { subject_id: a.entity_id, predicate: '成员', object_id: b.entity_id });

  const retired = retireEntity(session.id, a.entity_id);
  assert.equal(retired.status, 'retired');
  assert.equal(getStateMemory(session.id).relations.length, 0);

  expectError(() => retireEntity(session.id, 'no-such-entity'), 'not_found');
});

test('updateEntityField 校验失败 400，字段不适用 400，回退默认值', () => {
  const { world, session } = setupSession();
  insertCharacterStateField(sandbox.db, world.id, {
    field_key: 'mood', label: '心情', type: 'text', update_mode: 'manual', default_value: JSON.stringify('平静'),
  });
  const entity = createEntity(session.id, { type: 'character', name: '沈彦' });

  const beforeWrite = getStateMemory(session.id).entities.find((e) => e.entity_id === entity.entity_id);
  assert.equal(beforeWrite.fields.find((f) => f.field_key === 'mood').value, '平静');

  const updated = updateEntityField(session.id, entity.entity_id, 'mood', { value: '警惕' });
  assert.equal(updated.fields.find((f) => f.field_key === 'mood').value, '警惕');

  expectError(() => updateEntityField(session.id, entity.entity_id, 'no-such-field', { value: 'x' }), 'bad_request');
  expectError(() => updateEntityField(session.id, entity.entity_id, 'mood', { value: 123 }), 'bad_request');
});

test('updateWorld：时间须可解析，地点解析到当前 location 实体时带 location_entity_id', () => {
  const { session } = setupSession();
  const location = createEntity(session.id, { type: 'location', name: '旧港仓库' });

  expectError(() => updateWorld(session.id, { time: '不是日期' }), 'bad_request');

  const world = updateWorld(session.id, { time: '1000-03-15T08:00', location: location.entity_id });
  assert.equal(world.time, '1000-03-15T08:00');
  assert.equal(world.location, '旧港仓库');
  assert.equal(world.location_entity_id, location.entity_id);

  const freeText = updateWorld(session.id, { location: '荒野小径' });
  assert.equal(freeText.location, '荒野小径');
  assert.equal(freeText.location_entity_id, null);
});

test('关系：新建、缺客体 400、主体不存在 404、删除', () => {
  const { session } = setupSession();
  const a = createEntity(session.id, { type: 'character', name: 'A' });

  expectError(() => createRelation(session.id, { subject_id: a.entity_id, predicate: '成员' }), 'bad_request');
  expectError(() => createRelation(session.id, { subject_id: 'no-such', predicate: '成员', object_value: '组织' }), 'not_found');

  const relation = createRelation(session.id, { subject_id: a.entity_id, predicate: '成员', object_value: '铁匠会' });
  assert.equal(getStateMemory(session.id).relations.length, 1);

  deleteRelation(session.id, relation.relation_id);
  assert.equal(getStateMemory(session.id).relations.length, 0);
  expectError(() => deleteRelation(session.id, relation.relation_id), 'not_found');
});

test('事项：新建、未知类型 400、更新内容与状态、未知状态 400', () => {
  const { session } = setupSession();
  const a = createEntity(session.id, { type: 'character', name: 'A' });

  expectError(() => createThread(session.id, { kind: '不存在的类型', content: 'x' }), 'bad_request');

  const thread = createThread(session.id, { kind: '承诺', participants: [a.entity_id], content: '三日内归还账本' });
  assert.equal(thread.status, 'active');
  assert.deepEqual(thread.participants, [a.entity_id]);
  assert.deepEqual(getStateMemory(session.id).threads, [thread]);

  const updated = updateThread(session.id, thread.thread_id, { status: 'resolved' });
  assert.equal(updated.status, 'resolved');
  assert.equal(updated.content, '三日内归还账本');

  expectError(() => updateThread(session.id, thread.thread_id, { status: '未知状态' }), 'bad_request');
  expectError(() => updateThread(session.id, 'no-such-thread', { status: 'active' }), 'not_found');
});

test('getStateMemory 返回 presentIds、world、age，会话不存在 404', () => {
  const { session } = setupSession();
  const entity = createEntity(session.id, { type: 'character', name: '沈彦' });
  updateEntity(session.id, entity.entity_id, { profile: { birth_date: '980-01-01' } });
  updateWorld(session.id, { time: '1000-01-01T00:00' });
  upsertPresence(session.id, 0, [entity.entity_id]);

  const state = getStateMemory(session.id);
  assert.deepEqual(state.presentIds, [entity.entity_id]);
  assert.equal(state.world.time, '1000-01-01T00:00');
  const found = state.entities.find((e) => e.entity_id === entity.entity_id);
  assert.equal(found.age.age, 20);

  expectError(() => getStateMemory('no-such-session'), 'not_found');
});

test('applyEntityBasicPatch 直接调用：改名、加别名、置顶；改名与其他实体重名 409', () => {
  const { session } = setupSession();
  const a = createEntity(session.id, { type: 'character', name: 'A' });
  createEntity(session.id, { type: 'character', name: 'B' });
  const entity = listCurrentEntities(session.id).find((e) => e.entity_id === a.entity_id);

  applyEntityBasicPatch(session.id, entity, { name: 'A2', aliases: ['小 A'], pinned: true }, 1);
  assert.equal(entity.name, 'A2');
  assert.deepEqual(JSON.parse(entity.aliases_json), ['小 A']);
  assert.equal(entity.pinned, 1);

  expectError(() => applyEntityBasicPatch(session.id, entity, { name: 'B' }, 1), 'conflict');
});

test('applyManualProfilePatch 直接调用：写入与清空档案字段，evidence 记为手动编辑', () => {
  const { world, session } = setupSession();
  const a = createEntity(session.id, { type: 'character', name: 'A' });
  const entity = listCurrentEntities(session.id).find((e) => e.entity_id === a.entity_id);

  applyManualProfilePatch(session.id, entity, world.id, { social_identity: ['铁匠会成员', '铁匠会成员'] }, 1);
  const afterWrite = getStateMemory(session.id).entities.find((e) => e.entity_id === entity.entity_id);
  assert.deepEqual(afterWrite.profile.social_identity.value, ['铁匠会成员', '铁匠会成员']);
  assert.equal(afterWrite.profile.social_identity.evidence, '手动编辑');

  applyManualProfilePatch(session.id, entity, world.id, { social_identity: null }, 1);
  const afterClear = getStateMemory(session.id).entities.find((e) => e.entity_id === entity.entity_id);
  assert.equal(afterClear.profile.social_identity, undefined);
});

test('applyManualDynamicPatch 直接调用：写入普通现状与「位置」，清空现状', () => {
  const { session } = setupSession();
  const loc = createEntity(session.id, { type: 'location', name: '旧港仓库' });
  const a = createEntity(session.id, { type: 'character', name: 'A' });
  const entity = listCurrentEntities(session.id).find((e) => e.entity_id === a.entity_id);

  applyManualDynamicPatch(session.id, entity, { 伤势: '轻伤', 位置: loc.entity_id }, 1);
  const afterWrite = getStateMemory(session.id).entities.find((e) => e.entity_id === entity.entity_id);
  assert.equal(afterWrite.dynamic.伤势, '轻伤');
  assert.equal(afterWrite.dynamic.位置, '旧港仓库');

  applyManualDynamicPatch(session.id, entity, { 伤势: null }, 1);
  const afterClear = getStateMemory(session.id).entities.find((e) => e.entity_id === entity.entity_id);
  assert.equal(afterClear.dynamic.伤势, undefined);
});
