import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport } from '../helpers/test-env.js';
import { insertPersona, insertWorld } from '../helpers/fixtures.js';

const sandbox = createTestSandbox('service-persona-state-fields');
sandbox.setEnv();

const svc = await freshImport('backend/services/persona-state-fields.js');
const valQueries = await freshImport('backend/db/queries/persona-state-values.js');

after(() => sandbox.cleanup());

function setupWorld() {
  const world = insertWorld(sandbox.db);
  const p1 = insertPersona(sandbox.db, world.id, { name: 'P1' });
  const p2 = insertPersona(sandbox.db, world.id, { name: 'P2' });
  return { world, p1, p2 };
}

test('createPersonaStateField：为该世界所有 persona 初始化状态值', () => {
  const { world, p1, p2 } = setupWorld();
  const field = svc.createPersonaStateField(world.id, {
    field_key: 'mood',
    label: '心情',
    type: 'text',
    default_value: '平静',
  });
  assert.equal(field.field_key, 'mood');

  const v1 = valQueries.getPersonaStateValuesWithFieldsByPersonaId(p1.id, world.id);
  const v2 = valQueries.getPersonaStateValuesWithFieldsByPersonaId(p2.id, world.id);
  assert.ok(v1.find((v) => v.field_key === 'mood'));
  assert.ok(v2.find((v) => v.field_key === 'mood'));
});

test('createPersonaStateField：可为大量 persona 批量初始化，并保留已有运行时值', () => {
  const { world, p1, p2 } = setupWorld();
  const personas = [p1, p2];
  for (let index = 0; index < 180; index += 1) {
    personas.push(insertPersona(sandbox.db, world.id, { name: `批量玩家 ${index}` }));
  }
  valQueries.upsertPersonaStateValueByPersonaId(p1.id, world.id, 'mood', {
    defaultValueJson: 'old-default',
    runtimeValueJson: 'custom-runtime',
  });

  svc.createPersonaStateField(world.id, {
    field_key: 'mood', label: '心情', type: 'text', default_value: '平静',
  });

  assert.equal(sandbox.db.prepare(`
    SELECT COUNT(*) AS count FROM persona_state_values WHERE world_id = ? AND field_key = ?
  `).get(world.id, 'mood').count, personas.length);
  const customized = sandbox.db.prepare(`
    SELECT default_value_json, runtime_value_json
    FROM persona_state_values WHERE persona_id = ? AND field_key = ?
  `).get(p1.id, 'mood');
  assert.deepEqual(customized, { default_value_json: '平静', runtime_value_json: 'custom-runtime' });
});

test('updatePersonaStateField：更新跟踪默认值但保留已自定义默认值和运行时值', () => {
  const { world, p1, p2 } = setupWorld();
  const field = svc.createPersonaStateField(world.id, {
    field_key: 'hp',
    label: '体力',
    type: 'number',
    default_value: '10',
  });

  valQueries.upsertPersonaStateValueByPersonaId(p1.id, world.id, 'hp', { runtimeValueJson: '"99"' });
  valQueries.upsertPersonaStateValueByPersonaId(p2.id, world.id, 'hp', {
    defaultValueJson: '"12"',
    runtimeValueJson: '"50"',
  });

  svc.updatePersonaStateField(field.id, { default_value: '20' });

  const p1Vals = valQueries.getPersonaStateValuesWithFieldsByPersonaId(p1.id, world.id);
  const hp1 = p1Vals.find((v) => v.field_key === 'hp');
  assert.equal(hp1.default_value_json, '20');
  assert.equal(hp1.runtime_value_json, '"99"');

  const p2Vals = valQueries.getPersonaStateValuesWithFieldsByPersonaId(p2.id, world.id);
  const hp2 = p2Vals.find((v) => v.field_key === 'hp');
  assert.equal(hp2.default_value_json, '"12"');
  assert.equal(hp2.runtime_value_json, '"50"');
});

test('persona 默认值批量写入失败时整批回滚', () => {
  const { world, p1 } = setupWorld();
  assert.throws(
    () => valQueries.upsertPersonaStateValues([
      { personaId: p1.id, worldId: world.id, fieldKey: 'rollback', defaultValueJson: '1' },
      { personaId: 'missing-persona', worldId: world.id, fieldKey: 'rollback', defaultValueJson: '2' },
    ]),
    /FOREIGN KEY constraint failed/,
  );
  assert.equal(sandbox.db.prepare(`
    SELECT COUNT(*) AS count FROM persona_state_values WHERE world_id = ? AND field_key = ?
  `).get(world.id, 'rollback').count, 0);
});

test('updatePersonaStateField：仅传非 default_value 的 patch 不触发同步', () => {
  const { world } = setupWorld();
  const field = svc.createPersonaStateField(world.id, {
    field_key: 'tag',
    label: '标签',
    type: 'text',
    default_value: 'A',
  });
  const updated = svc.updatePersonaStateField(field.id, { label: '新标签' });
  assert.equal(updated.label, '新标签');
});

test('deletePersonaStateField：级联删除该世界 persona 的状态值', () => {
  const { world, p1 } = setupWorld();
  const field = svc.createPersonaStateField(world.id, {
    field_key: 'energy',
    label: '能量',
    type: 'text',
    default_value: '满',
  });
  let p1Vals = valQueries.getPersonaStateValuesWithFieldsByPersonaId(p1.id, world.id);
  assert.ok(p1Vals.find((v) => v.field_key === 'energy'));

  svc.deletePersonaStateField(field.id);
  p1Vals = valQueries.getPersonaStateValuesWithFieldsByPersonaId(p1.id, world.id);
  assert.equal(p1Vals.find((v) => v.field_key === 'energy'), undefined);
});

test('deletePersonaStateField：id 不存在时安全返回', () => {
  const result = svc.deletePersonaStateField('no-such-id');
  // 不抛错；返回 better-sqlite3 的 RunResult，changes=0
  assert.ok(result);
});

test('reorderPersonaStateFields：按 id 数组重排 sort_order', () => {
  const { world } = setupWorld();
  const a = svc.createPersonaStateField(world.id, { field_key: 'a', label: 'A', type: 'text', default_value: '' });
  const b = svc.createPersonaStateField(world.id, { field_key: 'b', label: 'B', type: 'text', default_value: '' });
  const c = svc.createPersonaStateField(world.id, { field_key: 'c', label: 'C', type: 'text', default_value: '' });

  svc.reorderPersonaStateFields(world.id, [c.id, a.id, b.id]);
  const list = svc.getPersonaStateFieldsByWorldId(world.id);
  const keysSorted = list
    .filter((f) => ['a', 'b', 'c'].includes(f.field_key))
    .map((f) => f.field_key);
  assert.deepEqual(keysSorted, ['c', 'a', 'b']);
});
