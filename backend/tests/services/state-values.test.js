import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport } from '../helpers/test-env.js';
import {
  insertCharacter,
  insertCharacterStateField,
  insertCharacterStateValue,
  insertWorld,
  insertWorldStateField,
} from '../helpers/fixtures.js';

const sandbox = createTestSandbox('service-state-values-suite');
sandbox.setEnv();

after(() => sandbox.cleanup());

test('updateCharacterDefaultStateValueValidated 会规范化列表值并保留 default_value_json', async () => {
  const world = insertWorld(sandbox.db, { name: '状态世界-列表' });
  const character = insertCharacter(sandbox.db, world.id, { name: '阿绪' });
  insertCharacterStateField(sandbox.db, world.id, {
    field_key: 'inventory',
    label: '背包',
    type: 'list',
    allow_empty: 1,
  });

  const { updateCharacterDefaultStateValueValidated } = await freshImport('backend/services/state-values.js');
  const row = updateCharacterDefaultStateValueValidated(character.id, 'inventory', JSON.stringify('剑，盾、火把'));

  assert.equal(row.default_value_json, '["剑","盾","火把"]');
  assert.equal(row.runtime_value_json, null);
});

test('resetCharacterStateValuesValidated 只清空 runtime_value_json，不改 default_value_json', async () => {
  const world = insertWorld(sandbox.db, { name: '状态世界-重置' });
  const character = insertCharacter(sandbox.db, world.id, { name: '赛林' });
  insertCharacterStateField(sandbox.db, world.id, {
    field_key: 'hp',
    label: '生命',
    type: 'number',
    allow_empty: 0,
  });
  insertCharacterStateValue(sandbox.db, character.id, {
    field_key: 'hp',
    default_value_json: '100',
    runtime_value_json: '70',
  });

  const { resetCharacterStateValuesValidated } = await freshImport('backend/services/state-values.js');
  resetCharacterStateValuesValidated(character.id);

  const row = sandbox.db.prepare(`
    SELECT default_value_json, runtime_value_json
    FROM character_state_values
    WHERE character_id = ? AND field_key = ?
  `).get(character.id, 'hp');
  assert.equal(row.default_value_json, '100');
  assert.equal(row.runtime_value_json, null);
});

test('updateWorldDefaultStateValueValidated 在非法 JSON 或非法值时抛错', async () => {
  const world = insertWorld(sandbox.db, { name: '状态世界-非法值' });
  insertWorldStateField(sandbox.db, world.id, {
    field_key: 'threat',
    label: '威胁',
    type: 'number',
    min_value: 1,
    max_value: 10,
    allow_empty: 0,
  });

  const { updateWorldDefaultStateValueValidated } = await freshImport('backend/services/state-values.js');
  assert.throws(() => updateWorldDefaultStateValueValidated(world.id, 'threat', 'not-json'), /JSON/);
  assert.throws(() => updateWorldDefaultStateValueValidated(world.id, 'threat', '99'), /类型约束/);
});

test('resolveUploadPath 会拒绝空值、越权路径并返回 uploadsDir 内绝对路径', async () => {
  const { resolveUploadPath } = await freshImport('backend/services/state-values.js');
  assert.equal(resolveUploadPath('', sandbox.uploadsDir), null);
  assert.equal(resolveUploadPath('../../../avatars/a.png', sandbox.uploadsDir), null);
  assert.equal(resolveUploadPath('../../../../etc/passwd', sandbox.uploadsDir), null);
  assert.equal(
    resolveUploadPath('avatars/hero.png', sandbox.uploadsDir),
    `${sandbox.uploadsDir}/avatars/hero.png`,
  );
});
