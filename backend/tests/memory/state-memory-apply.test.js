import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { createTestSandbox, freshImport } from '../helpers/test-env.js';
import {
  insertWorld, insertPersona, insertCharacter, insertSession,
  insertCharacterStateField, insertPersonaStateField,
} from '../helpers/fixtures.js';

const sandbox = createTestSandbox('memory-state-memory-apply');
sandbox.setEnv();

after(() => sandbox.cleanup());

const {
  resolveEntityRef, resolveSeqRef, buildEntityIndex, verifyEvidence,
  isFieldOwnedByUserField, truncateText, truncateListItems,
  applyStateMemoryOps, applyEntityFields, ensureBaseEntities,
} = await freshImport('backend/memory/state-memory-apply.js');
const {
  listCurrentEntities, listCurrentRelations, listThreads, listActiveThreads,
  getCurrentWorldProfile, getEntityDetails, upsertEntity, upsertProfileField,
} = await freshImport('backend/db/queries/state-memory.js');
const { getEntityStateValues } = await freshImport('backend/db/queries/session-entity-state-values.js');

function setupSession(patch = {}) {
  const world = insertWorld(sandbox.db, patch.world);
  const persona = insertPersona(sandbox.db, world.id, { name: '旅人', ...patch.persona });
  const character = insertCharacter(sandbox.db, world.id, { name: '沈彦', ...patch.character });
  const session = insertSession(sandbox.db, {
    world_id: world.id, persona_id: persona.id, character_id: character.id, mode: 'chat', ...patch.session,
  });
  return { world, persona, character, session };
}

function makeEntity(sessionId, { type = 'character', name, seq, round = 1, cardId = null, aliases = [] }) {
  const entityId = crypto.randomUUID();
  upsertEntity(sessionId, { entityId, seq, type, name, aliasesJson: JSON.stringify(aliases), cardId }, round);
  return entityId;
}

const noop = { turnText: '', realDate: false, mainCharacterEntityId: null };

// ─── 纯函数 ─────────────────────────────────────────────

test('resolveEntityRef 支持 e<seq>、完全匹配的名字与别名', () => {
  const index = buildEntityIndex([
    { entity_id: 'ent-1', seq: 1, name: '沈彦', aliases_json: JSON.stringify(['沈先生']), type: 'character' },
    { entity_id: 'ent-2', seq: 2, name: '林乔', aliases_json: '[]', type: 'character' },
  ]);
  assert.equal(resolveEntityRef('e1', index), 'ent-1');
  assert.equal(resolveEntityRef('沈彦', index), 'ent-1');
  assert.equal(resolveEntityRef('沈先生', index), 'ent-1');
  assert.equal(resolveEntityRef('e3', index), null);
  assert.equal(resolveEntityRef('不存在的人', index), null);
});

test('resolveSeqRef 按前缀和 seq 从列表中解析 r<seq>/t<seq>/f<seq>', () => {
  const relations = [{ seq: 12, relation_id: 'rel-12' }];
  assert.equal(resolveSeqRef('r12', 'r', relations, 'relation_id'), 'rel-12');
  assert.equal(resolveSeqRef('r99', 'r', relations, 'relation_id'), null);
  assert.equal(resolveSeqRef('t12', 'r', relations, 'relation_id'), null);
});

test('verifyEvidence 要求去空白后是本轮原文子串，且长度在 4~80 之间', () => {
  const turnText = '用户：沈彦左眉有一道旧伤疤。AI：他点了点头。';
  assert.equal(verifyEvidence('沈彦左眉有一道旧伤疤', turnText), true);
  assert.equal(verifyEvidence('沈彦 左眉 有一道旧伤疤', turnText), true);
  assert.equal(verifyEvidence('编造的证据文本', turnText), false);
  assert.equal(verifyEvidence('沈彦', turnText), false);
  assert.equal(verifyEvidence(123, turnText), false);
});

test('isFieldOwnedByUserField 按 field_key 或 label 完全匹配', () => {
  const fields = [{ field_key: 'favor', label: '好感' }];
  assert.equal(isFieldOwnedByUserField('favor', fields), true);
  assert.equal(isFieldOwnedByUserField('好感', fields), true);
  assert.equal(isFieldOwnedByUserField('信任', fields), false);
});

test('truncateText/truncateListItems 截断超长文本、条目与条数', () => {
  assert.equal(truncateText('字'.repeat(70)).length, 60);
  const items = Array.from({ length: 12 }, (_, i) => `项${i}`.repeat(10));
  const truncated = truncateListItems(items);
  assert.equal(truncated.length, 10);
  assert.ok(truncated.every((item) => item.length <= 30));
});

// ─── create_entity / 档案字段可变性 ─────────────────────────────────────────────

test('create_entity 与已有实体重名时转为对该实体的档案更新，不新建', () => {
  const { world, session } = setupSession();
  const entityId = makeEntity(session.id, { name: '沈彦', seq: 1 });
  const result = applyStateMemoryOps({
    sessionId: session.id, worldId: world.id, round: 2,
    ops: [{ op: 'create_entity', type: 'character', name: '沈彦', profile: { occupation: { value: '前海军军官', evidence: '前海军军官' } } }],
    turnText: '沈彦其实是名前海军军官。', realDate: false, mainCharacterEntityId: null,
  });
  assert.equal(result.applied, 1);
  const entities = listCurrentEntities(session.id);
  assert.equal(entities.length, 1);
  assert.equal(entities[0].entity_id, entityId);
  const details = getEntityDetails(session.id, [entityId]);
  assert.equal(JSON.parse(details[entityId].profile.occupation.value_json), '前海军军官');
});

test('create_entity 初始档案：原文有据的记证据，无据的创作补全记为 AI 补全，占位值与年龄被丢弃', () => {
  const { world, session } = setupSession();
  const result = applyStateMemoryOps({
    sessionId: session.id, worldId: world.id, round: 1,
    ops: [{
      op: 'create_entity', type: 'character', name: '苏晚',
      profile: {
        gender: { value: '女', evidence: '她叫苏晚，是个女孩' },
        occupation: '前空乘',
        age_recorded: 26,
        birth_date: '2000-03-01',
        species: '未知',
      },
    }],
    turnText: '她叫苏晚，是个女孩，以前在航司工作。', realDate: false, mainCharacterEntityId: null,
  });
  assert.equal(result.applied, 1);
  const entity = listCurrentEntities(session.id).find((e) => e.name === '苏晚');
  const { profile } = getEntityDetails(session.id, [entity.entity_id])[entity.entity_id];
  assert.equal(profile.gender.evidence, '她叫苏晚，是个女孩');
  assert.equal(JSON.parse(profile.occupation.value_json), '前空乘');
  assert.equal(profile.occupation.evidence, 'AI 补全');
  assert.equal(profile.age_recorded, undefined, '年龄按出生日期自动计算，AI 写入被拒');
  assert.equal(JSON.parse(profile.birth_date.value_json), '2000-03-01');
  assert.equal(profile.species, undefined);
});

test('fill_profile 只补空字段：已有值不被无证据覆盖，关联角色卡的实体同样可补', () => {
  const { world, session, character } = setupSession();
  makeEntity(session.id, { name: '林知夏', seq: 1 });
  makeEntity(session.id, { name: '卡片角色', seq: 2, cardId: character.id });
  applyStateMemoryOps({
    sessionId: session.id, worldId: world.id, round: 1,
    ops: [{ op: 'update_profile', entity: 'e1', field: 'occupation', value: '模特', evidence: '她是一名模特' }],
    turnText: '她是一名模特。', realDate: false, mainCharacterEntityId: null,
  });

  const result = applyStateMemoryOps({
    sessionId: session.id, worldId: world.id, round: 2,
    ops: [
      { op: 'fill_profile', entity: 'e1', profile: { occupation: '学生', height: '168cm', core_traits: ['谨慎'] } },
      { op: 'fill_profile', entity: 'e2', profile: { height: '170cm' } },
    ],
    ...noop,
  });
  assert.equal(result.applied, 2);
  assert.equal(result.rejected.length, 0);

  const cardEntity = listCurrentEntities(session.id).find((e) => e.name === '卡片角色');
  assert.equal(JSON.parse(getEntityDetails(session.id, [cardEntity.entity_id])[cardEntity.entity_id].profile.height.value_json), '170cm');
  const entity = listCurrentEntities(session.id).find((e) => e.name === '林知夏');
  const { profile } = getEntityDetails(session.id, [entity.entity_id])[entity.entity_id];
  assert.equal(JSON.parse(profile.occupation.value_json), '模特');
  assert.equal(JSON.parse(profile.height.value_json), '168cm');
  assert.deepEqual(JSON.parse(profile.core_traits.value_json), ['谨慎']);
});

test('fill_profile 可以覆盖「未知」这类占位值', () => {
  const { world, session } = setupSession();
  const place = makeEntity(session.id, { type: 'location', name: '渡口', seq: 1 });
  upsertProfileField(session.id, place, 'category', '"未知"', '迁移', 0);

  const result = applyStateMemoryOps({
    sessionId: session.id, worldId: world.id, round: 1,
    ops: [{ op: 'fill_profile', entity: 'e1', profile: { category: '内河渡口' } }],
    ...noop,
  });
  assert.equal(result.applied, 1);
  assert.equal(JSON.parse(getEntityDetails(session.id, [place])[place].profile.category.value_json), '内河渡口');
});

test('证据不是本轮原文子串时，档案写入被拒', () => {
  const { world, session } = setupSession();
  makeEntity(session.id, { name: '沈彦', seq: 1 });
  const result = applyStateMemoryOps({
    sessionId: session.id, worldId: world.id, round: 1,
    ops: [{ op: 'update_profile', entity: 'e1', field: 'gender', value: '男', evidence: '编造的证据' }],
    turnText: '沈彦点了点头。', realDate: false, mainCharacterEntityId: null,
  });
  assert.equal(result.applied, 0);
  assert.match(result.rejected[0].reason, /证据核验失败/);
});

test('immutable 字段有值时 update_profile 被拒，correct_profile 生效', () => {
  const { world, session } = setupSession();
  const entityId = makeEntity(session.id, { name: '沈彦', seq: 1 });
  const turnText = '沈彦确认自己是男性，后来发现其实是女性。';
  const first = applyStateMemoryOps({
    sessionId: session.id, worldId: world.id, round: 1,
    ops: [{ op: 'update_profile', entity: 'e1', field: 'gender', value: '男', evidence: '沈彦确认自己是男性' }],
    turnText, realDate: false, mainCharacterEntityId: null,
  });
  assert.equal(first.applied, 1);

  const retry = applyStateMemoryOps({
    sessionId: session.id, worldId: world.id, round: 2,
    ops: [{ op: 'update_profile', entity: 'e1', field: 'gender', value: '女', evidence: '其实是女性' }],
    turnText, realDate: false, mainCharacterEntityId: null,
  });
  assert.equal(retry.applied, 0);
  assert.match(retry.rejected[0].reason, /correct_profile/);

  const corrected = applyStateMemoryOps({
    sessionId: session.id, worldId: world.id, round: 3,
    ops: [{ op: 'correct_profile', entity: 'e1', field: 'gender', value: '女', evidence: '其实是女性' }],
    turnText, realDate: false, mainCharacterEntityId: null,
  });
  assert.equal(corrected.applied, 1);
  const details = getEntityDetails(session.id, [entityId]);
  assert.equal(JSON.parse(details[entityId].profile.gender.value_json), '女');
});

test('高门槛字段 core_traits 拒绝 update_profile 整体替换，list_add 每轮只接受一条', () => {
  const { world, session } = setupSession();
  makeEntity(session.id, { name: '沈彦', seq: 1 });
  const turnText = '沈彦性格克制，也很多疑，做事很有责任感。';

  const updateResult = applyStateMemoryOps({
    sessionId: session.id, worldId: world.id, round: 1,
    ops: [{ op: 'update_profile', entity: 'e1', field: 'core_traits', value: ['克制'], evidence: '沈彦性格克制' }],
    turnText, realDate: false, mainCharacterEntityId: null,
  });
  assert.equal(updateResult.applied, 0);
  assert.match(updateResult.rejected[0].reason, /禁止整体替换/);

  const batch = applyStateMemoryOps({
    sessionId: session.id, worldId: world.id, round: 2,
    ops: [
      { op: 'list_add', entity: 'e1', field: 'core_traits', items: ['克制'], evidence: '沈彦性格克制' },
      { op: 'list_add', entity: 'e1', field: 'core_traits', items: ['多疑'], evidence: '也很多疑' },
    ],
    turnText, realDate: false, mainCharacterEntityId: null,
  });
  assert.equal(batch.applied, 1);
  assert.equal(batch.rejected.length, 1);
  assert.match(batch.rejected[0].reason, /本轮已用满/);
});

test('占位值在 set_state 与 create_entity profile 中都被丢弃', () => {
  const { world, session } = setupSession();
  const result = applyStateMemoryOps({
    sessionId: session.id, worldId: world.id, round: 1,
    ops: [
      { op: 'create_entity', type: 'character', name: '神秘人', profile: { occupation: { value: '未知', evidence: '身份不明的神秘人' } } },
      { op: 'set_state', entity: '神秘人', key: '伤势', value: '未知' },
    ],
    turnText: '一个身份不明的神秘人出现了。', realDate: false, mainCharacterEntityId: null,
  });
  assert.equal(result.applied, 1);
  assert.equal(result.rejected.length, 1);
  assert.match(result.rejected[0].reason, /占位值/);
  const entity = listCurrentEntities(session.id).find((e) => e.name === '神秘人');
  const details = getEntityDetails(session.id, [entity.entity_id]);
  assert.equal(details[entity.entity_id].profile.occupation, undefined);
});

// ─── 字段归属（D10）与用户字段联动 ─────────────────────────────────────────────

test('用户字段同名时 set_state 被拒，applyEntityFields 可写该字段', () => {
  const { world, session } = setupSession();
  insertCharacterStateField(sandbox.db, world.id, { field_key: 'favor', label: '好感', type: 'number', update_mode: 'llm_auto' });
  const entityId = makeEntity(session.id, { name: '林乔', seq: 1 });

  const stateResult = applyStateMemoryOps({
    sessionId: session.id, worldId: world.id, round: 1,
    ops: [{ op: 'set_state', entity: 'e1', key: '好感', value: '很高' }],
    turnText: '林乔对你的好感很高。', realDate: false, mainCharacterEntityId: null,
  });
  assert.equal(stateResult.applied, 0);
  assert.match(stateResult.rejected[0].reason, /字段已由用户状态字段负责/);

  const fieldsResult = applyEntityFields({
    sessionId: session.id, worldId: world.id, entityFields: { e1: { favor: 60 } }, mainCharacterEntityId: null,
  });
  assert.equal(fieldsResult.applied, 1);
  const values = getEntityStateValues(session.id, [entityId]);
  assert.equal(JSON.parse(values[entityId].favor), 60);
});

test('同义用户字段停用档案字段：职业字段生效时 occupation 操作被丢弃', () => {
  const { world, session } = setupSession();
  insertCharacterStateField(sandbox.db, world.id, { field_key: 'identity_char', label: '职业', type: 'text', update_mode: 'manual' });
  makeEntity(session.id, { name: '沈彦', seq: 1 });
  const result = applyStateMemoryOps({
    sessionId: session.id, worldId: world.id, round: 1,
    ops: [{ op: 'update_profile', entity: 'e1', field: 'occupation', value: '海关顾问', evidence: '现在是海关顾问' }],
    turnText: '现在是海关顾问', realDate: false, mainCharacterEntityId: null,
  });
  assert.equal(result.applied, 0);
  assert.match(result.rejected[0].reason, /档案字段已停用/);
});

test('对 NPC 生效但为手动更新的字段，applyEntityFields 丢弃', () => {
  const { world, session } = setupSession();
  insertCharacterStateField(sandbox.db, world.id, { field_key: 'trust', label: '信任度', type: 'number', update_mode: 'manual' });
  const entityId = makeEntity(session.id, { name: '林乔', seq: 1 });
  const result = applyEntityFields({
    sessionId: session.id, worldId: world.id, entityFields: { e1: { trust: 80 } }, mainCharacterEntityId: null,
  });
  assert.equal(result.applied, 0);
  assert.match(result.rejected[0].reason, /字段不适用或非自动更新/);
  const values = getEntityStateValues(session.id, [entityId]);
  assert.equal(values[entityId].trust, undefined);
});

// ─── 玩家实体只有身份与外貌档案字段 ─────────────────────────────────────────────

test('玩家实体可写身份与外貌档案字段，人格字段被拒', () => {
  const { world, session } = setupSession();
  const playerId = makeEntity(session.id, { type: 'player', name: '旅人', seq: 1 });
  const result = applyStateMemoryOps({
    sessionId: session.id, worldId: world.id, round: 1,
    ops: [
      { op: 'update_profile', entity: 'e1', field: 'outfit', value: ['灰色斗篷'] },
      { op: 'update_profile', entity: 'e1', field: 'occupation', value: '旅人', evidence: '身份是旅人' },
      { op: 'list_add', entity: 'e1', field: 'core_traits', items: ['沉稳'], evidence: '身份是旅人' },
    ],
    turnText: '身份是旅人', realDate: false, mainCharacterEntityId: null,
  });
  assert.equal(result.applied, 2);
  assert.equal(result.rejected.length, 1);
  assert.match(result.rejected[0].reason, /未知档案字段/);
  const details = getEntityDetails(session.id, [playerId]);
  assert.deepEqual(JSON.parse(details[playerId].profile.outfit.value_json), ['灰色斗篷']);
  assert.equal(JSON.parse(details[playerId].profile.occupation.value_json), '旅人');
});

test('世界有同义玩家字段时，玩家的 outfit 档案操作被停用', () => {
  const { world, session } = setupSession();
  insertPersonaStateField(sandbox.db, world.id, { field_key: 'outfit_persona', label: '穿着', type: 'text', update_mode: 'manual' });
  makeEntity(session.id, { type: 'player', name: '旅人', seq: 1 });
  const result = applyStateMemoryOps({
    sessionId: session.id, worldId: world.id, round: 1,
    ops: [{ op: 'update_profile', entity: 'e1', field: 'outfit', value: ['灰色斗篷'] }],
    turnText: '', realDate: false, mainCharacterEntityId: null,
  });
  assert.equal(result.applied, 0);
  assert.match(result.rejected[0].reason, /档案字段已停用/);
});

// ─── 关系表：排他谓词 / 共用同一张表 ─────────────────────────────────────────────

test('排他谓词换手时自动关闭旧关系；不同谓词共用同一张关系表', () => {
  const { world, session } = setupSession();
  const item = makeEntity(session.id, { type: 'item', name: '银戒指', seq: 1 });
  const char1 = makeEntity(session.id, { name: '沈彦', seq: 2 });
  const char2 = makeEntity(session.id, { name: '林乔', seq: 3 });
  const faction = makeEntity(session.id, { type: 'faction', name: '黑潮会', seq: 4 });
  const place = makeEntity(session.id, { type: 'location', name: '旧港', seq: 5 });
  void item;

  applyStateMemoryOps({
    sessionId: session.id, worldId: world.id, round: 1,
    ops: [{ op: 'upsert_relation', subject: 'e1', predicate: '持有者', object: 'e2' }],
    ...noop,
  });
  assert.equal(listCurrentRelations(session.id)[0].object_id, char1);

  applyStateMemoryOps({
    sessionId: session.id, worldId: world.id, round: 2,
    ops: [{ op: 'upsert_relation', subject: 'e1', predicate: '持有者', object: 'e3' }],
    ...noop,
  });
  const afterSwap = listCurrentRelations(session.id);
  assert.equal(afterSwap.length, 1);
  assert.equal(afterSwap[0].object_id, char2);

  const combined = applyStateMemoryOps({
    sessionId: session.id, worldId: world.id, round: 3,
    ops: [
      { op: 'upsert_relation', subject: 'e4', predicate: '控制者', object: 'e5' },
      { op: 'upsert_relation', subject: 'e2', predicate: '成员', object: 'e4' },
    ],
    ...noop,
  });
  assert.equal(combined.applied, 2);
  const allRelations = listCurrentRelations(session.id);
  assert.equal(allRelations.length, 3);
  assert.deepEqual(new Set(allRelations.map((r) => r.predicate)), new Set(['持有者', '控制者', '成员']));
  void place;
});

test('upsert_relation：同一主体到同一客体实体的新谓词替换旧关系，其他客体不受影响', () => {
  const { world, session } = setupSession();
  const shen = makeEntity(session.id, { name: '沈砚', seq: 1 });
  const su = makeEntity(session.id, { name: '苏晚', seq: 2 });
  const lin = makeEntity(session.id, { name: '林知夏', seq: 3 });

  applyStateMemoryOps({
    sessionId: session.id, worldId: world.id, round: 1,
    ops: [
      { op: 'upsert_relation', subject: 'e1', predicate: '包养意向对象', object: 'e2' },
      { op: 'upsert_relation', subject: 'e1', predicate: '包养意向对象', object: 'e3' },
      { op: 'upsert_relation', subject: 'e1', predicate: '住处', objectValue: '江景大平层' },
    ],
    ...noop,
  });
  const result = applyStateMemoryOps({
    sessionId: session.id, worldId: world.id, round: 2,
    ops: [{ op: 'upsert_relation', subject: 'e1', predicate: '包养关系', object: 'e2' }],
    ...noop,
  });
  assert.equal(result.applied, 1);

  const current = listCurrentRelations(session.id).map((r) => [r.subject_id, r.predicate, r.object_id ?? r.object_value]);
  assert.deepEqual(new Set(current.map(JSON.stringify)), new Set([
    [shen, '包养关系', su],
    [shen, '包养意向对象', lin],
    [shen, '住处', '江景大平层'],
  ].map(JSON.stringify)));
});

// ─── 关联角色卡的实体 ─────────────────────────────────────────────

test('关联角色卡的实体与其他角色一样可写档案、outfit、动态状态、关系与事项', () => {
  const { world, session, character } = setupSession();
  const cardEntity = makeEntity(session.id, { name: '沈彦', seq: 1, cardId: character.id });
  makeEntity(session.id, { name: '林乔', seq: 2 });

  const result = applyStateMemoryOps({
    sessionId: session.id, worldId: world.id, round: 1,
    ops: [
      { op: 'update_profile', entity: 'e1', field: 'occupation', value: '海关顾问', evidence: '现在是海关顾问' },
      { op: 'update_profile', entity: 'e1', field: 'outfit', value: ['黑色风衣'] },
      { op: 'set_state', entity: 'e1', key: '伤势', value: '右臂受伤' },
      { op: 'upsert_relation', subject: 'e1', predicate: '成员', object: 'e2' },
      { op: 'open_thread', kind: '承诺', participants: ['e1'], content: '沈彦承诺三日内归还账本' },
    ],
    turnText: '现在是海关顾问', realDate: false, mainCharacterEntityId: null,
  });
  assert.equal(result.applied, 5);
  assert.equal(result.rejected.length, 0);

  const details = getEntityDetails(session.id, [cardEntity]);
  assert.equal(JSON.parse(details[cardEntity].profile.occupation.value_json), '海关顾问');
  assert.deepEqual(JSON.parse(details[cardEntity].profile.outfit.value_json), ['黑色风衣']);
  assert.equal(details[cardEntity].dynamic['伤势'], '右臂受伤');
});

// ─── 未了事项 ─────────────────────────────────────────────

test('未了事项仅在收到结案操作时结束，支持失败结果', () => {
  const { world, session } = setupSession();
  applyStateMemoryOps({
    sessionId: session.id, worldId: world.id, round: 1,
    ops: [{ op: 'open_thread', kind: '任务', participants: [], content: '归还账本' }],
    turnText: '需要归还账本', realDate: false, mainCharacterEntityId: null,
  });
  applyStateMemoryOps({
    sessionId: session.id, worldId: world.id, round: 2,
    ops: [], turnText: '还在寻找账本', realDate: false, mainCharacterEntityId: null,
  });
  assert.equal(listThreads(session.id)[0].status, 'active');
  const ended = applyStateMemoryOps({
    sessionId: session.id, worldId: world.id, round: 3,
    ops: [{ op: 'resolve_thread', thread: 't1', outcome: 'failed' }],
    turnText: '账本已经被烧毁', realDate: false, mainCharacterEntityId: null,
  });
  assert.equal(ended.applied, 1);
  assert.equal(listThreads(session.id)[0].status, 'failed');
});

test('相同类型和内容的未了事项不重复立案，内容不同仍立案', () => {
  const { world, session } = setupSession();
  const first = applyStateMemoryOps({
    sessionId: session.id, worldId: world.id, round: 1,
    ops: [{ op: 'open_thread', kind: '任务', participants: [], content: '归还账本' }],
    turnText: '需要归还账本', realDate: false, mainCharacterEntityId: null,
  });
  const duplicate = applyStateMemoryOps({
    sessionId: session.id, worldId: world.id, round: 2,
    ops: [{ op: 'open_thread', kind: '任务', participants: [], content: '归还 账本' }],
    turnText: '还是要归还账本', realDate: false, mainCharacterEntityId: null,
  });
  const different = applyStateMemoryOps({
    sessionId: session.id, worldId: world.id, round: 3,
    ops: [{ op: 'open_thread', kind: '任务', participants: [], content: '寻找宝石' }],
    turnText: '还要寻找宝石', realDate: false, mainCharacterEntityId: null,
  });
  assert.equal(first.applied, 1);
  assert.equal(duplicate.rejected[0].reason, '已有相同的未了事项');
  assert.equal(different.applied, 1);
  assert.equal(listThreads(session.id).length, 2);
});

test('连续 12 轮没被碰到的进行中事项搁置，本轮碰到或间隔不足则保持进行中', () => {
  const { world, session } = setupSession();
  applyStateMemoryOps({
    sessionId: session.id, worldId: world.id, round: 1,
    ops: [
      { op: 'open_thread', kind: '任务', participants: [], content: '寻找宝石' },
      { op: 'open_thread', kind: '任务', participants: [], content: '归还账本' },
      { op: 'open_thread', kind: '承诺', participants: [], content: '守住北门' },
    ],
    turnText: '寻找宝石，归还账本，守住北门', realDate: false, mainCharacterEntityId: null,
  });
  applyStateMemoryOps({
    sessionId: session.id, worldId: world.id, round: 12,
    ops: [{ op: 'update_thread', thread: 't3', content: '守住北门' }],
    turnText: '北门仍要守住', realDate: false, mainCharacterEntityId: null,
  });
  applyStateMemoryOps({
    sessionId: session.id, worldId: world.id, round: 13,
    ops: [], turnText: '账本还在舱里', realDate: false, mainCharacterEntityId: null,
  });
  const byContent = new Map(listThreads(session.id).map((thread) => [thread.content, thread.status]));
  assert.equal(byContent.get('寻找宝石'), 'dormant');
  assert.equal(byContent.get('归还账本'), 'active');
  assert.equal(byContent.get('守住北门'), 'active');
});

test('搁置事项被推进时回到进行中，被结案时直接结束', () => {
  const { world, session } = setupSession();
  applyStateMemoryOps({
    sessionId: session.id, worldId: world.id, round: 1,
    ops: [
      { op: 'open_thread', kind: '任务', participants: [], content: '寻找宝石' },
      { op: 'open_thread', kind: '任务', participants: [], content: '护送信件' },
    ],
    turnText: '寻找宝石，护送信件', realDate: false, mainCharacterEntityId: null,
  });
  applyStateMemoryOps({
    sessionId: session.id, worldId: world.id, round: 13,
    ops: [], turnText: '天气转阴', realDate: false, mainCharacterEntityId: null,
  });
  assert.equal(listThreads(session.id).every((thread) => thread.status === 'dormant'), true);

  applyStateMemoryOps({
    sessionId: session.id, worldId: world.id, round: 14,
    ops: [
      { op: 'update_thread', thread: 't1', content: '宝石在旧港，还没找到' },
      { op: 'resolve_thread', thread: 't2', outcome: 'resolved' },
    ],
    turnText: '宝石在旧港，信件已经送到', realDate: false, mainCharacterEntityId: null,
  });
  const threads = listThreads(session.id);
  assert.equal(threads.find((thread) => thread.seq === 1).status, 'active');
  assert.equal(threads.find((thread) => thread.seq === 2).status, 'resolved');
  assert.equal(listActiveThreads(session.id).length, 1);
});

// ─── 世界档案：时间与地点 ─────────────────────────────────────────────

test('set_world time 不得回退，真实日期模式下丢弃 AI 写入', () => {
  const { world, session } = setupSession();
  const first = applyStateMemoryOps({
    sessionId: session.id, worldId: world.id, round: 1,
    ops: [{ op: 'set_world', key: 'time', value: '1000-03-16T08:00' }],
    ...noop,
  });
  assert.equal(first.applied, 1);

  const rollback = applyStateMemoryOps({
    sessionId: session.id, worldId: world.id, round: 2,
    ops: [{ op: 'set_world', key: 'time', value: '1000-03-15T08:00' }],
    ...noop,
  });
  assert.equal(rollback.applied, 0);
  assert.match(rollback.rejected[0].reason, /回退/);

  const realDateResult = applyStateMemoryOps({
    sessionId: session.id, worldId: world.id, round: 3,
    ops: [{ op: 'set_world', key: 'time', value: '1000-03-20T08:00' }],
    turnText: '', realDate: true, mainCharacterEntityId: null,
  });
  assert.equal(realDateResult.applied, 0);
  assert.match(realDateResult.rejected[0].reason, /真实日期模式/);

  assert.equal(getCurrentWorldProfile(session.id).time, '1000-03-16T08:00');
});

test('set_world location 写入明确地名时自动建 location 实体', () => {
  const { world, session } = setupSession();
  const result = applyStateMemoryOps({
    sessionId: session.id, worldId: world.id, round: 1,
    ops: [{ op: 'set_world', key: 'location', value: '旧港仓库' }],
    ...noop,
  });
  assert.equal(result.applied, 1);
  const location = listCurrentEntities(session.id).find((e) => e.type === 'location' && e.name === '旧港仓库');
  assert.ok(location);
  const profile = getCurrentWorldProfile(session.id);
  assert.equal(profile.location, '旧港仓库');
  assert.equal(profile.location_entity_id, location.entity_id);
});

test('角色「位置」只关联已有地点实体，不自动建实体', () => {
  const { world, session } = setupSession();
  makeEntity(session.id, { name: '沈彦', seq: 1 });
  makeEntity(session.id, { name: '旧港仓库', seq: 2, type: 'location' });
  const result = applyStateMemoryOps({
    sessionId: session.id, worldId: world.id, round: 1,
    ops: [
      { op: 'set_state', entity: 'e1', key: '位置', value: '走廊' },
      { op: 'set_state', entity: 'e1', key: '位置', value: 'e2' },
    ],
    ...noop,
  });
  assert.equal(result.applied, 2);
  assert.equal(listCurrentEntities(session.id).length, 2);
  const entityId = listCurrentEntities(session.id)[0].entity_id;
  assert.equal(getEntityDetails(session.id, [entityId])[entityId].dynamic['位置'], '旧港仓库');
});

// ─── retire_entity ─────────────────────────────────────────────

test('retire_entity 关闭其参与的关系，但不关闭事项', () => {
  const { world, session } = setupSession();
  makeEntity(session.id, { name: '沈彦', seq: 1 });
  makeEntity(session.id, { name: '林乔', seq: 2 });
  applyStateMemoryOps({
    sessionId: session.id, worldId: world.id, round: 1,
    ops: [
      { op: 'upsert_relation', subject: 'e1', predicate: '成员', object: 'e2' },
      { op: 'open_thread', kind: '承诺', participants: ['e1', 'e2'], content: '林乔承诺三日内归还账本' },
    ],
    ...noop,
  });
  const retireResult = applyStateMemoryOps({
    sessionId: session.id, worldId: world.id, round: 2,
    ops: [{ op: 'retire_entity', entity: 'e1', reason: '已死亡' }],
    ...noop,
  });
  assert.equal(retireResult.applied, 1);
  assert.equal(listCurrentRelations(session.id).length, 0);
  assert.equal(listThreads(session.id).filter((t) => t.status === 'active').length, 1);
  const entity = listCurrentEntities(session.id).find((e) => e.name === '沈彦');
  assert.equal(entity.status, 'retired');
});

// ─── 边界：ops 非数组 ─────────────────────────────────────────────

test('ops 不是数组时整体忽略', () => {
  const { world, session } = setupSession();
  const result = applyStateMemoryOps({
    sessionId: session.id, worldId: world.id, round: 1, ops: { op: 'set_present', entities: [] },
    ...noop,
  });
  assert.deepEqual(result, { applied: 0, rejected: [] });
  assert.equal(listCurrentEntities(session.id).length, 0);
});

// ─── ensureBaseEntities ─────────────────────────────────────────────

test('ensureBaseEntities 建好玩家与主角色实体，且幂等', () => {
  const { world, session, character, persona } = setupSession();
  const first = ensureBaseEntities({ sessionId: session.id, worldId: world.id, round: 1, persona, mainCharacter: character });
  assert.ok(first.playerEntityId);
  assert.ok(first.mainCharacterEntityId);
  assert.equal(listCurrentEntities(session.id).length, 2);

  const second = ensureBaseEntities({ sessionId: session.id, worldId: world.id, round: 2, persona, mainCharacter: character });
  assert.deepEqual(second, first);
  assert.equal(listCurrentEntities(session.id).length, 2);
});

test('ensureBaseEntities 把人设与主角色卡的档案初始值带入还空着的档案字段，已有值不覆盖', () => {
  const { world, session, character, persona } = setupSession();
  const personaWithDefaults = { ...persona, profile_defaults_json: JSON.stringify({ gender: '男', core_traits: ['沉稳'] }) };
  const card = { ...character, profile_defaults_json: JSON.stringify({ occupation: '镖师', core_traits: ['寡言'], age_recorded: { age: 30 } }) };

  const { playerEntityId, mainCharacterEntityId } = ensureBaseEntities({
    sessionId: session.id, worldId: world.id, round: 1, persona: personaWithDefaults, mainCharacter: card,
  });
  const details = getEntityDetails(session.id, [playerEntityId, mainCharacterEntityId]);
  assert.equal(JSON.parse(details[playerEntityId].profile.gender.value_json), '男');
  assert.equal(details[playerEntityId].profile.core_traits, undefined, '玩家没有人格字段');
  assert.equal(JSON.parse(details[mainCharacterEntityId].profile.occupation.value_json), '镖师');
  assert.deepEqual(JSON.parse(details[mainCharacterEntityId].profile.core_traits.value_json), ['寡言']);
  assert.equal(details[mainCharacterEntityId].profile.age_recorded, undefined, '年龄不从初始值写入');
  assert.equal(details[mainCharacterEntityId].profile.occupation.evidence, '初始值');

  applyStateMemoryOps({
    sessionId: session.id, worldId: world.id, round: 2,
    ops: [{ op: 'update_profile', entity: 'e2', field: 'occupation', value: '捕快', evidence: '他如今是捕快' }],
    turnText: '他如今是捕快', realDate: false, mainCharacterEntityId,
  });
  ensureBaseEntities({ sessionId: session.id, worldId: world.id, round: 3, persona: personaWithDefaults, mainCharacter: card });
  const after = getEntityDetails(session.id, [mainCharacterEntityId])[mainCharacterEntityId];
  assert.equal(JSON.parse(after.profile.occupation.value_json), '捕快');
});
