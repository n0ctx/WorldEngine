import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport } from '../../helpers/test-env.js';
import { insertWorld } from '../../helpers/fixtures.js';

const sandbox = createTestSandbox('query-state-fields-suite');
sandbox.setEnv();

after(() => sandbox.cleanup());

const fieldSuites = [
  {
    label: 'world',
    path: 'backend/db/queries/world-state-fields.js',
    createName: 'createWorldStateField',
    getAllName: 'getWorldStateFieldsByWorldId',
    updateName: 'updateWorldStateField',
    reorderName: 'reorderWorldStateFields',
  },
  {
    label: 'character',
    path: 'backend/db/queries/character-state-fields.js',
    createName: 'createCharacterStateField',
    getAllName: 'getCharacterStateFieldsByWorldId',
    updateName: 'updateCharacterStateField',
    reorderName: 'reorderCharacterStateFields',
  },
  {
    label: 'persona',
    path: 'backend/db/queries/persona-state-fields.js',
    createName: 'createPersonaStateField',
    getAllName: 'getPersonaStateFieldsByWorldId',
    updateName: 'updatePersonaStateField',
    reorderName: 'reorderPersonaStateFields',
  },
];

for (const suite of fieldSuites) {
  test(`${suite.label} state fields query 会解析数组字段、支持部分更新和重排`, async () => {
    const world = insertWorld(sandbox.db, { name: `字段世界-${suite.label}` });
    const mod = await freshImport(suite.path);
    const create = mod[suite.createName];
    const getAll = mod[suite.getAllName];
    const update = mod[suite.updateName];
    const reorder = mod[suite.reorderName];

    const first = create(world.id, {
      field_key: `${suite.label}_mood`,
      label: '心情',
      type: 'enum',
      enum_options: ['平静', '激动'],
      trigger_keywords: ['火焰'],
    });
    const second = create(world.id, {
      field_key: `${suite.label}_hp`,
      label: '生命',
      type: 'number',
    });

    assert.deepEqual(first.enum_options, ['平静', '激动']);
    assert.deepEqual(first.trigger_keywords, ['火焰']);
    assert.equal(second.sort_order, first.sort_order + 1);

    const updated = update(first.id, {
      label: '新心情',
      enum_options: ['冷静'],
      trigger_keywords: null,
      sort_order: 9,
    });
    assert.equal(updated.label, '新心情');
    assert.deepEqual(updated.enum_options, ['冷静']);
    assert.equal(updated.trigger_keywords, null);
    assert.equal(updated.sort_order, 9);

    reorder(world.id, [second.id, first.id]);
    const rows = getAll(world.id);
    assert.deepEqual(rows.map((row) => row.field_key), [`${suite.label}_hp`, `${suite.label}_mood`]);
    assert.deepEqual(rows.map((row) => row.sort_order), [0, 1]);
  });
}
