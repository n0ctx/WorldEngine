import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport } from '../helpers/test-env.js';
import { insertWorld, insertSession } from '../helpers/fixtures.js';

const sandbox = createTestSandbox('memory-state-memory-birth-date');
sandbox.setEnv();

after(() => sandbox.cleanup());

const { applyStateMemoryOps } = await freshImport('backend/memory/state-memory-apply.js');
const { listCurrentEntities, getEntityDetails } = await freshImport('backend/db/queries/state-memory.js');

test('副模型写的出生日期：问号存为「?」，带纪年名的被拒', () => {
  const world = insertWorld(sandbox.db);
  const session = insertSession(sandbox.db, { world_id: world.id });
  const result = applyStateMemoryOps({
    sessionId: session.id, worldId: world.id, round: 1,
    ops: [
      { op: 'create_entity', type: 'character', name: '老祖', profile: { birth_date: '？' } },
      { op: 'create_entity', type: 'character', name: '童子', profile: { birth_date: '道元历205-03-12' } },
    ],
    turnText: '', realDate: false, mainCharacterEntityId: null,
  });
  assert.equal(result.applied, 2);
  const ids = listCurrentEntities(session.id).map((e) => e.entity_id);
  const details = getEntityDetails(session.id, ids);
  assert.deepEqual(ids.map((id) => details[id].profile.birth_date?.value_json), [JSON.stringify('?'), undefined]);
});
