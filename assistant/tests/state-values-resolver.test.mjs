// assistant/tests/state-values-resolver.test.mjs
// 覆盖 dispatch_subagent 的 stateValues typed 入参解析与校验。
// 注：type 校验委托给 backend/services/state-values.js#validateStateValue，
// 接受的输入与 apply 阶段完全一致（如 list 接受逗号字符串、boolean 接受 "true"）。
import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveStateValues, deriveWorldIdForStateValues } from '../server/tools/meta/state-values-resolver.js';

function fakePersonaFields() {
  return [
    { field_key: 'food_user', label: '食物', type: 'list', allow_empty: 1 },
    { field_key: 'private_parts_user', label: '私处', type: 'list', allow_empty: 1 },
    { field_key: 'base_address_user', label: '据点地址', type: 'text', allow_empty: 1 },
    { field_key: 'hp', label: '体力', type: 'number', min_value: 0, max_value: 100, allow_empty: 0 },
    { field_key: 'mood', label: '情绪', type: 'enum', enum_options: ['平静', '亢奋', '低落'], allow_empty: 0 },
    { field_key: 'alive', label: '在世', type: 'boolean', allow_empty: 0 },
    { field_key: 'birthday', label: '生日', type: 'datetime', allow_empty: 1 },
    { field_key: 'stats', label: '能力值', type: 'table', table_columns: [{ key: 'atk' }, { key: 'def' }], allow_empty: 1 },
  ];
}

const deps = { loadFields: () => fakePersonaFields() };

test('list/text/number/enum/boolean/datetime/table/null 全部能正确解析为 value_json', () => {
  const r = resolveStateValues({
    worldId: 'w1', targetType: 'persona-card',
    entries: [
      { field: '食物', value: ['面包', '水'] },
      { field_key: 'private_parts_user', value: ['xxx'] },
      { field: '据点地址', value: '青鸾阁三楼' },
      { field: '体力', value: 80 },
      { field: '情绪', value: '亢奋' },
      { field: '在世', value: true },
      { field: '生日', value: '1000-03-15T14:30' },
      { field: '能力值', value: { atk: 30, def: 20 } },
      { field: '生日', value: null },
    ],
    deps,
  });
  assert.equal(r.success, true);
  assert.deepEqual(r.stateValueOps[0], { target: 'persona', field_key: 'food_user', value_json: '["面包","水"]' });
  assert.equal(r.stateValueOps[2].value_json, '"青鸾阁三楼"');
  assert.equal(r.stateValueOps[3].value_json, '80');
  assert.equal(r.stateValueOps[4].value_json, '"亢奋"');
  assert.equal(r.stateValueOps[5].value_json, 'true');
  assert.equal(r.stateValueOps[6].value_json, '"1000-03-15T14:30"');
  assert.equal(r.stateValueOps[7].value_json, '{"atk":30,"def":20}');
  assert.equal(r.stateValueOps[8].value_json, null);
});

test('list 字段接受逗号字符串（与 apply 阶段一致）', () => {
  const r = resolveStateValues({
    worldId: 'w1', targetType: 'persona-card',
    entries: [{ field: '食物', value: '面包,水' }],
    deps,
  });
  assert.equal(r.success, true);
  assert.equal(r.stateValueOps[0].value_json, '["面包","水"]');
});

test('boolean 接受 "true"/"false" 字符串（与 apply 阶段一致）', () => {
  const r = resolveStateValues({
    worldId: 'w1', targetType: 'persona-card',
    entries: [{ field: '在世', value: 'true' }],
    deps,
  });
  assert.equal(r.success, true);
  assert.equal(r.stateValueOps[0].value_json, 'true');
});

test('enum 字段值不在选项内 → 失败', () => {
  const r = resolveStateValues({
    worldId: 'w1', targetType: 'persona-card',
    entries: [{ field: '情绪', value: '愤怒' }],
    deps,
  });
  assert.equal(r.success, false);
  assert.match(r.error, /type=enum/);
});

test('number 越界 → 失败', () => {
  const r = resolveStateValues({
    worldId: 'w1', targetType: 'persona-card',
    entries: [{ field: '体力', value: 200 }],
    deps,
  });
  assert.equal(r.success, false);
  assert.match(r.error, /type=number/);
});

test('datetime 格式错 → 失败', () => {
  const r = resolveStateValues({
    worldId: 'w1', targetType: 'persona-card',
    entries: [{ field: '生日', value: '2020/01/01' }],
    deps,
  });
  assert.equal(r.success, false);
  assert.match(r.error, /type=datetime/);
});

test('field_key 不存在 → 失败', () => {
  const r = resolveStateValues({
    worldId: 'w1', targetType: 'persona-card',
    entries: [{ field_key: 'unknown_key', value: 1 }],
    deps,
  });
  assert.equal(r.success, false);
  assert.match(r.error, /field_key "unknown_key" 在世界状态字段中不存在/);
});

test('label 找不到 → 失败', () => {
  const r = resolveStateValues({
    worldId: 'w1', targetType: 'persona-card',
    entries: [{ field: '不存在字段', value: 1 }],
    deps,
  });
  assert.equal(r.success, false);
  assert.match(r.error, /找不到对应字段/);
});

test('缺少 value 字段 → 失败（要求显式 null 才能清空）', () => {
  const r = resolveStateValues({
    worldId: 'w1', targetType: 'persona-card',
    entries: [{ field: '食物' }],
    deps,
  });
  assert.equal(r.success, false);
  assert.match(r.error, /缺少 value/);
});

test('target 与 targetType 冲突 → 失败', () => {
  const r = resolveStateValues({
    worldId: 'w1', targetType: 'persona-card',
    entries: [{ field: '食物', value: ['x'], target: 'character' }],
    deps,
  });
  assert.equal(r.success, false);
  assert.match(r.error, /不一致/);
});

test('worldId 缺失 → 失败', () => {
  const r = resolveStateValues({
    worldId: null, targetType: 'persona-card',
    entries: [{ field: '食物', value: ['x'] }],
    deps,
  });
  assert.equal(r.success, false);
  assert.match(r.error, /worldId/);
});

test('targetType 不支持 → 失败', () => {
  const r = resolveStateValues({
    worldId: 'w1', targetType: 'world-card',
    entries: [{ field: '食物', value: ['x'] }],
    deps,
  });
  assert.equal(r.success, false);
  assert.match(r.error, /仅支持/);
});

test('deriveWorldIdForStateValues: create 时 entityRef 即 worldId（跨步骤新建世界后写值）', () => {
  const wid = deriveWorldIdForStateValues({
    targetType: 'persona-card',
    operation: 'create',
    entityRef: 'world-new-uuid', // dependsOn: [step-1] 解析后得到的世界 ID
    context: { worldId: 'context-world-other' },
  });
  assert.equal(wid, 'world-new-uuid');
});

test('deriveWorldIdForStateValues: update 时 entityRef 是 personaId → 反查得到 world_id', () => {
  const wid = deriveWorldIdForStateValues({
    targetType: 'persona-card',
    operation: 'update',
    entityRef: 'persona-uuid',
    context: { worldId: 'context-world-other' },
    deps: { getPersonaById: (id) => (id === 'persona-uuid' ? { world_id: 'real-world' } : null) },
  });
  assert.equal(wid, 'real-world');
});

test('deriveWorldIdForStateValues: update 时 entityRef 不是已知 persona/character → 当作 worldId 透传', () => {
  const wid = deriveWorldIdForStateValues({
    targetType: 'character-card',
    operation: 'update',
    entityRef: 'maybe-world-id',
    context: { worldId: 'context-world' },
    deps: { getCharacterById: () => null },
  });
  assert.equal(wid, 'maybe-world-id');
});

test('deriveWorldIdForStateValues: context.worldId 占位符被解开', () => {
  const wid = deriveWorldIdForStateValues({
    targetType: 'persona-card',
    operation: 'create',
    entityRef: 'context.worldId',
    context: { worldId: 'ctx-w' },
  });
  assert.equal(wid, 'ctx-w');
});

test('deriveWorldIdForStateValues: 无 entityRef 时回退到 context.worldId', () => {
  const wid = deriveWorldIdForStateValues({
    targetType: 'persona-card',
    operation: 'update',
    entityRef: null,
    context: { worldId: 'ctx-w' },
  });
  assert.equal(wid, 'ctx-w');
});

test('不允许为空的字段传 null → 失败', () => {
  const r = resolveStateValues({
    worldId: 'w1', targetType: 'persona-card',
    entries: [{ field: '体力', value: null }],
    deps,
  });
  assert.equal(r.success, false);
  assert.match(r.error, /allow_empty=0/);
});
