import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport } from '../../helpers/test-env.js';
import {
  insertCharacter,
  insertCharacterStateField,
  insertPersonaStateField,
  insertWorld,
  insertWorldStateField,
} from '../../helpers/fixtures.js';

const sandbox = createTestSandbox('query-state-values-suite');
sandbox.setEnv();

after(() => sandbox.cleanup());

const valueSuites = [
  {
    label: 'world',
    path: 'backend/db/queries/world-state-values.js',
    createField(owner) {
      insertWorldStateField(sandbox.db, owner.worldId, {
        field_key: 'weather',
        label: '天气',
        default_value: '"晴"',
      });
    },
    createOwner() {
      const world = insertWorld(sandbox.db, { name: '值世界-world' });
      return { worldId: world.id, lookupId: world.id, fieldKey: 'weather' };
    },
    upsertName: 'upsertWorldStateValue',
    getName: 'getWorldStateValue',
    getAllName: 'getAllWorldStateValues',
    withFieldsName: 'getWorldStateValuesWithFields',
    clearRuntimeName: 'clearWorldStateRuntimeValues',
  },
  {
    label: 'character',
    path: 'backend/db/queries/character-state-values.js',
    createField(owner) {
      insertCharacterStateField(sandbox.db, owner.worldId, {
        field_key: 'hp',
        label: '生命',
        type: 'number',
        default_value: '100',
      });
    },
    createOwner() {
      const world = insertWorld(sandbox.db, { name: '值世界-character' });
      const character = insertCharacter(sandbox.db, world.id, { name: '角色' });
      return { worldId: world.id, lookupId: character.id, fieldKey: 'hp' };
    },
    upsertName: 'upsertCharacterStateValue',
    getName: 'getCharacterStateValue',
    getAllName: 'getAllCharacterStateValues',
    withFieldsName: 'getCharacterStateValuesWithFields',
    clearRuntimeName: 'clearCharacterStateRuntimeValues',
  },
  {
    label: 'persona',
    path: 'backend/db/queries/persona-state-values.js',
    createField(owner) {
      insertPersonaStateField(sandbox.db, owner.worldId, {
        field_key: 'trust',
        label: '信任',
        type: 'number',
        default_value: '50',
      });
    },
    createOwner() {
      const world = insertWorld(sandbox.db, { name: '值世界-persona' });
      return { worldId: world.id, lookupId: world.id, fieldKey: 'trust' };
    },
    upsertName: 'upsertPersonaStateValue',
    getName: null,
    getAllName: 'getAllPersonaStateValues',
    withFieldsName: 'getPersonaStateValuesWithFields',
    clearRuntimeName: 'clearPersonaStateRuntimeValues',
  },
];

for (const suite of valueSuites) {
  test(`${suite.label} state values query 会支持 default/runtime upsert 与 effective 值回退`, async () => {
    const owner = suite.createOwner();
    suite.createField(owner);
    const mod = await freshImport(suite.path);
    const upsert = mod[suite.upsertName];
    const getAll = mod[suite.getAllName];
    const getWithFields = mod[suite.withFieldsName];
    const clearRuntime = mod[suite.clearRuntimeName];

    const created = upsert(owner.lookupId, owner.fieldKey, { defaultValueJson: owner.fieldKey === 'weather' ? '"阴"' : '80' });
    assert.equal(created.runtime_value_json, null);

    const updated = upsert(owner.lookupId, owner.fieldKey, { runtimeValueJson: owner.fieldKey === 'weather' ? '"雨"' : '66' });
    assert.notEqual(updated.updated_at, 0);
    const allRows = getAll(owner.lookupId);
    assert.equal(allRows.length, 1);
    assert.equal(allRows[0].runtime_value_json, updated.runtime_value_json);

    let withFields = getWithFields(owner.lookupId);
    assert.equal(withFields[0].default_value_json, created.default_value_json);
    assert.equal(withFields[0].effective_value_json, updated.runtime_value_json);

    clearRuntime(owner.lookupId);
    withFields = getWithFields(owner.lookupId);
    assert.equal(withFields[0].runtime_value_json, null);
    assert.equal(withFields[0].effective_value_json, created.default_value_json);
  });
}
