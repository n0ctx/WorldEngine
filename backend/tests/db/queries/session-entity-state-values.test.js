import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport } from '../../helpers/test-env.js';
import { insertSession, insertWorld } from '../../helpers/fixtures.js';

const sandbox = createTestSandbox('query-session-entity-state-values');
sandbox.setEnv();

after(() => sandbox.cleanup());

const {
  upsertEntityStateValues,
  getEntityStateValues,
  clearEntityStateValuesBySession,
  deleteEntityStateValuesByEntity,
} = await freshImport('backend/db/queries/session-entity-state-values.js');
const { default: db } = await freshImport('backend/db/index.js');

function setupSession() {
  const world = insertWorld(sandbox.db);
  const session = insertSession(sandbox.db, { world_id: world.id });
  return session.id;
}

test('upsertEntityStateValues 命中 (entity_id, field_key) 时更新，否则插入新行', () => {
  const sessionId = setupSession();
  upsertEntityStateValues(sessionId, [{ entityId: 'entity-upsert-1', fieldKey: 'favor', runtimeValueJson: '60' }]);
  upsertEntityStateValues(sessionId, [{ entityId: 'entity-upsert-1', fieldKey: 'favor', runtimeValueJson: '80' }]);
  upsertEntityStateValues(sessionId, [{ entityId: 'entity-upsert-1', fieldKey: 'mood', runtimeValueJson: '"平静"' }]);

  const rows = db.prepare(
    `SELECT entity_id, field_key, runtime_value_json FROM session_entity_state_values WHERE session_id = ? ORDER BY field_key`,
  ).all(sessionId);
  assert.deepEqual(rows, [
    { entity_id: 'entity-upsert-1', field_key: 'favor', runtime_value_json: '80' },
    { entity_id: 'entity-upsert-1', field_key: 'mood', runtime_value_json: '"平静"' },
  ]);
});

test('getEntityStateValues 返回按实体分组的字段值，没有值的实体得到空对象', () => {
  const sessionId = setupSession();
  upsertEntityStateValues(sessionId, [
    { entityId: 'entity-get-1', fieldKey: 'favor', runtimeValueJson: '60' },
    { entityId: 'entity-get-2', fieldKey: 'favor', runtimeValueJson: '10' },
  ]);

  const values = getEntityStateValues(sessionId, ['entity-get-1', 'entity-get-2', 'entity-get-3']);
  assert.deepEqual(values, {
    'entity-get-1': { favor: '60' },
    'entity-get-2': { favor: '10' },
    'entity-get-3': {},
  });

  assert.deepEqual(getEntityStateValues(sessionId, []), {});
});

test('clearEntityStateValuesBySession 清空整个会话的值', () => {
  const sessionId = setupSession();
  upsertEntityStateValues(sessionId, [{ entityId: 'entity-clear-1', fieldKey: 'favor', runtimeValueJson: '60' }]);
  clearEntityStateValuesBySession(sessionId);
  const rows = db.prepare(`SELECT * FROM session_entity_state_values WHERE session_id = ?`).all(sessionId);
  assert.deepEqual(rows, []);
});

test('deleteEntityStateValuesByEntity 只删除指定实体的值', () => {
  const sessionId = setupSession();
  upsertEntityStateValues(sessionId, [
    { entityId: 'entity-delete-1', fieldKey: 'favor', runtimeValueJson: '60' },
    { entityId: 'entity-delete-2', fieldKey: 'favor', runtimeValueJson: '10' },
  ]);
  deleteEntityStateValuesByEntity('entity-delete-1');
  const rows = db.prepare(`SELECT entity_id FROM session_entity_state_values WHERE session_id = ?`).all(sessionId);
  assert.deepEqual(rows, [{ entity_id: 'entity-delete-2' }]);
});
