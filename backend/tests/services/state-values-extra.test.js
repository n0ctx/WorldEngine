import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createTestSandbox } from '../helpers/test-env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

async function loadModule(rel) {
  const abs = path.resolve(REPO_ROOT, rel);
  return import(pathToFileURL(abs).href);
}
import {
  insertCharacter,
  insertCharacterStateField,
  insertCharacterStateValue,
  insertPersona,
  insertPersonaStateField,
  insertPersonaStateValue,
  insertWorld,
  insertWorldStateField,
  insertWorldStateValue,
} from '../helpers/fixtures.js';

const sandbox = createTestSandbox('service-state-values-extra');
sandbox.setEnv();

after(() => sandbox.cleanup());

test('updateCharacterDefaultStateValueValidated 在角色或字段不存在时抛错', async () => {
  const world = insertWorld(sandbox.db, { name: '错误路径世界' });
  const character = insertCharacter(sandbox.db, world.id, { name: '阿洛' });

  const { updateCharacterDefaultStateValueValidated } = await loadModule('backend/services/state-values.js');
  assert.throws(() => updateCharacterDefaultStateValueValidated('not-exist', 'hp', '100'), /角色不存在/);
  assert.throws(() => updateCharacterDefaultStateValueValidated(character.id, 'unknown', '"x"'), /状态字段不存在/);
});

test('updatePersonaDefaultStateValueValidated 校验 boolean / enum / text 的转换与拒绝', async () => {
  const world = insertWorld(sandbox.db, { name: 'persona-世界' });
  insertPersona(sandbox.db, world.id, { name: '我' });
  insertPersonaStateField(sandbox.db, world.id, {
    field_key: 'is_alive',
    label: '存活',
    type: 'boolean',
    allow_empty: 0,
  });
  insertPersonaStateField(sandbox.db, world.id, {
    field_key: 'mood',
    label: '心情',
    type: 'enum',
    enum_options: ['平静', '亢奋'],
    allow_empty: 0,
  });
  insertPersonaStateField(sandbox.db, world.id, {
    field_key: 'note',
    label: '备注',
    type: 'text',
    allow_empty: 1,
  });

  const { updatePersonaDefaultStateValueValidated } = await loadModule('backend/services/state-values.js');

  const boolRow = updatePersonaDefaultStateValueValidated(world.id, 'is_alive', '"true"');
  assert.equal(boolRow.default_value_json, 'true');

  const enumRow = updatePersonaDefaultStateValueValidated(world.id, 'mood', '"亢奋"');
  assert.equal(enumRow.default_value_json, '"亢奋"');
  assert.throws(
    () => updatePersonaDefaultStateValueValidated(world.id, 'mood', '"暴怒"'),
    /类型约束/,
  );

  // text + allow_empty + null → 写入 null
  const textRow = updatePersonaDefaultStateValueValidated(world.id, 'note', null);
  assert.equal(textRow.default_value_json, null);
});

test('updatePersonaDefaultStateValueValidated 在世界不存在时抛错', async () => {
  const { updatePersonaDefaultStateValueValidated } = await loadModule('backend/services/state-values.js');
  assert.throws(() => updatePersonaDefaultStateValueValidated('no-world', 'x', '"y"'), /世界不存在/);
});

test('updateWorldDefaultStateValueValidated 在世界或字段不存在时抛错', async () => {
  const world = insertWorld(sandbox.db, { name: '世界字段错误' });
  const { updateWorldDefaultStateValueValidated } = await loadModule('backend/services/state-values.js');
  assert.throws(() => updateWorldDefaultStateValueValidated('no-such-world', 'k', '1'), /世界不存在/);
  assert.throws(() => updateWorldDefaultStateValueValidated(world.id, 'unknown', '1'), /状态字段不存在/);
});

test('resetPersonaStateValuesValidated 会清空 runtime 但保留 default，并自动 ensure persona', async () => {
  const world = insertWorld(sandbox.db, { name: 'persona-重置' });
  insertPersonaStateField(sandbox.db, world.id, {
    field_key: 'gold',
    label: '金币',
    type: 'number',
    allow_empty: 0,
  });
  insertPersonaStateValue(sandbox.db, world.id, {
    field_key: 'gold',
    default_value_json: '100',
    runtime_value_json: '50',
  });

  const { resetPersonaStateValuesValidated } = await loadModule('backend/services/state-values.js');
  resetPersonaStateValuesValidated(world.id);

  const row = sandbox.db.prepare(`
    SELECT default_value_json, runtime_value_json
    FROM persona_state_values WHERE world_id = ? AND field_key = ?
  `).get(world.id, 'gold');
  assert.equal(row.default_value_json, '100');
  assert.equal(row.runtime_value_json, null);

  const personaRow = sandbox.db.prepare('SELECT id FROM personas WHERE world_id = ?').get(world.id);
  assert.ok(personaRow, 'persona 应被自动创建');
});

test('resetPersonaStateValuesValidated 在世界不存在时抛错', async () => {
  const { resetPersonaStateValuesValidated } = await loadModule('backend/services/state-values.js');
  assert.throws(() => resetPersonaStateValuesValidated('ghost-world'), /世界不存在/);
});

test('resetWorldStateValuesValidated 会清空 runtime 但保留 default', async () => {
  const world = insertWorld(sandbox.db, { name: '世界-重置' });
  insertWorldStateField(sandbox.db, world.id, {
    field_key: 'weather',
    label: '天气',
    type: 'enum',
    enum_options: ['晴', '雨'],
    allow_empty: 0,
  });
  insertWorldStateValue(sandbox.db, world.id, {
    field_key: 'weather',
    default_value_json: '"晴"',
    runtime_value_json: '"雨"',
  });

  const { resetWorldStateValuesValidated } = await loadModule('backend/services/state-values.js');
  resetWorldStateValuesValidated(world.id);

  const row = sandbox.db.prepare(`
    SELECT default_value_json, runtime_value_json
    FROM world_state_values WHERE world_id = ? AND field_key = ?
  `).get(world.id, 'weather');
  assert.equal(row.default_value_json, '"晴"');
  assert.equal(row.runtime_value_json, null);
});

test('resetWorldStateValuesValidated 在世界不存在时抛错', async () => {
  const { resetWorldStateValuesValidated } = await loadModule('backend/services/state-values.js');
  assert.throws(() => resetWorldStateValuesValidated('ghost-world'), /世界不存在/);
});

test('resetCharacterStateValuesValidated 在角色不存在时抛错', async () => {
  const { resetCharacterStateValuesValidated } = await loadModule('backend/services/state-values.js');
  assert.throws(() => resetCharacterStateValuesValidated('ghost-char'), /角色不存在/);
});

test('updateCharacterDefaultStateValueValidated 校验 number 边界与列表 allow_empty=0 拒绝空', async () => {
  const world = insertWorld(sandbox.db, { name: '边界世界' });
  const character = insertCharacter(sandbox.db, world.id, { name: '边界' });
  insertCharacterStateField(sandbox.db, world.id, {
    field_key: 'level',
    label: '等级',
    type: 'number',
    min_value: 1,
    max_value: 99,
    allow_empty: 0,
  });
  insertCharacterStateField(sandbox.db, world.id, {
    field_key: 'tags',
    label: '标签',
    type: 'list',
    allow_empty: 0,
  });

  const { updateCharacterDefaultStateValueValidated } = await loadModule('backend/services/state-values.js');

  const ok = updateCharacterDefaultStateValueValidated(character.id, 'level', '"50"');
  assert.equal(ok.default_value_json, '50');

  assert.throws(
    () => updateCharacterDefaultStateValueValidated(character.id, 'level', '0'),
    /类型约束/,
  );
  assert.throws(
    () => updateCharacterDefaultStateValueValidated(character.id, 'level', '100'),
    /类型约束/,
  );
  assert.throws(
    () => updateCharacterDefaultStateValueValidated(character.id, 'tags', '""'),
    /类型约束/,
  );
});

test('updateCharacterDefaultStateValueValidated 在 value_json 非字符串/非合法 JSON 时抛错', async () => {
  const world = insertWorld(sandbox.db, { name: 'JSON 错误' });
  const character = insertCharacter(sandbox.db, world.id, { name: '非法' });
  insertCharacterStateField(sandbox.db, world.id, {
    field_key: 't',
    label: '文本',
    type: 'text',
    allow_empty: 1,
  });

  const { updateCharacterDefaultStateValueValidated } = await loadModule('backend/services/state-values.js');
  assert.throws(
    () => updateCharacterDefaultStateValueValidated(character.id, 't', 123),
    /JSON 字符串/,
  );
  assert.throws(
    () => updateCharacterDefaultStateValueValidated(character.id, 't', 'not-json'),
    /合法 JSON/,
  );
});

test('resolveUploadPath 处理 .. 段穿插与不在 uploadsDir 的路径', async () => {
  const { resolveUploadPath } = await loadModule('backend/services/state-values.js');
  assert.equal(resolveUploadPath(null, sandbox.uploadsDir), null);
  assert.equal(resolveUploadPath('avatars/../../escape.png', sandbox.uploadsDir), null);
  assert.equal(resolveUploadPath('/avatars/abs.png', sandbox.uploadsDir), `${sandbox.uploadsDir}/avatars/abs.png`);
});
