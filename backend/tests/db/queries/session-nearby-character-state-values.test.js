import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport } from '../../helpers/test-env.js';
import { insertCharacter, insertSession, insertWorld } from '../../helpers/fixtures.js';

const sandbox = createTestSandbox('query-session-nearby-character-state-values');
sandbox.setEnv();

after(() => sandbox.cleanup());

function makeSession(name) {
  const world = insertWorld(sandbox.db, { name: `${name}-世界` });
  const character = insertCharacter(sandbox.db, world.id, { name: `${name}-角色` });
  const session = insertSession(sandbox.db, { character_id: character.id, world_id: world.id });
  return session.id;
}

test('upsertNearbyStateValue：插入新值', async () => {
  const sessionId = makeSession('insert');
  const { createNearbyCharacter } = await freshImport('backend/db/queries/session-nearby-characters.js');
  const { upsertNearbyStateValue, getStateValuesByNearbyId } =
    await freshImport('backend/db/queries/session-nearby-character-state-values.js');

  const nearbyId = createNearbyCharacter({ sessionId, name: 'A' });
  upsertNearbyStateValue({ sessionId, nearbyId, fieldKey: 'mood', valueJson: '"开心"' });

  const rows = getStateValuesByNearbyId(nearbyId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].field_key, 'mood');
  assert.equal(rows[0].runtime_value_json, '"开心"');
  assert.equal(rows[0].nearby_id, nearbyId);
  assert.equal(rows[0].session_id, sessionId);
  assert.ok(typeof rows[0].updated_at === 'number');
});

test('upsertNearbyStateValue：同 key 覆盖，行数仍为 1', async () => {
  const sessionId = makeSession('overwrite');
  const { createNearbyCharacter } = await freshImport('backend/db/queries/session-nearby-characters.js');
  const { upsertNearbyStateValue, getStateValuesByNearbyId } =
    await freshImport('backend/db/queries/session-nearby-character-state-values.js');

  const nearbyId = createNearbyCharacter({ sessionId, name: 'B' });
  upsertNearbyStateValue({ sessionId, nearbyId, fieldKey: 'mood', valueJson: '"开心"' });
  const firstId = getStateValuesByNearbyId(nearbyId)[0].id;

  upsertNearbyStateValue({ sessionId, nearbyId, fieldKey: 'mood', valueJson: '"难过"' });
  const rows = getStateValuesByNearbyId(nearbyId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, firstId);
  assert.equal(rows[0].runtime_value_json, '"难过"');
});

test('getStateValuesByNearbyId：按 field_key 排序', async () => {
  const sessionId = makeSession('order');
  const { createNearbyCharacter } = await freshImport('backend/db/queries/session-nearby-characters.js');
  const { upsertNearbyStateValue, getStateValuesByNearbyId } =
    await freshImport('backend/db/queries/session-nearby-character-state-values.js');

  const nearbyId = createNearbyCharacter({ sessionId, name: 'C' });
  upsertNearbyStateValue({ sessionId, nearbyId, fieldKey: 'mood', valueJson: '"x"' });
  upsertNearbyStateValue({ sessionId, nearbyId, fieldKey: 'age', valueJson: '18' });
  upsertNearbyStateValue({ sessionId, nearbyId, fieldKey: 'name', valueJson: '"n"' });

  const rows = getStateValuesByNearbyId(nearbyId);
  assert.deepEqual(rows.map((r) => r.field_key), ['age', 'mood', 'name']);
});

test('deleteStateValuesByNearbyId：清空指定 nearby 的全部 state values', async () => {
  const sessionId = makeSession('del-state');
  const { createNearbyCharacter } = await freshImport('backend/db/queries/session-nearby-characters.js');
  const { upsertNearbyStateValue, getStateValuesByNearbyId, deleteStateValuesByNearbyId } =
    await freshImport('backend/db/queries/session-nearby-character-state-values.js');

  const nearbyId = createNearbyCharacter({ sessionId, name: 'D' });
  upsertNearbyStateValue({ sessionId, nearbyId, fieldKey: 'mood', valueJson: '"x"' });
  upsertNearbyStateValue({ sessionId, nearbyId, fieldKey: 'age', valueJson: '18' });

  deleteStateValuesByNearbyId(nearbyId);
  assert.equal(getStateValuesByNearbyId(nearbyId).length, 0);
});

test('CASCADE：删 nearby 同步删 state values', async () => {
  const sessionId = makeSession('cascade');
  const { createNearbyCharacter, deleteNearbyById } =
    await freshImport('backend/db/queries/session-nearby-characters.js');
  const { upsertNearbyStateValue, getStateValuesByNearbyId } =
    await freshImport('backend/db/queries/session-nearby-character-state-values.js');

  const nearbyId = createNearbyCharacter({ sessionId, name: 'E' });
  upsertNearbyStateValue({ sessionId, nearbyId, fieldKey: 'mood', valueJson: '"开心"' });
  assert.equal(getStateValuesByNearbyId(nearbyId).length, 1);

  deleteNearbyById(nearbyId);
  assert.equal(getStateValuesByNearbyId(nearbyId).length, 0);
});
