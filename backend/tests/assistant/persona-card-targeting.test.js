import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport } from '../helpers/test-env.js';
import { insertPersona, insertPersonaStateField, insertWorld } from '../helpers/fixtures.js';

const sandbox = createTestSandbox('assistant-persona-card-targeting');
sandbox.setEnv();

after(() => sandbox.cleanup());

test('persona-card update honors explicit personaId instead of active persona', async () => {
  const world = insertWorld(sandbox.db, { name: '多玩家卡世界' });
  const activePersona = insertPersona(sandbox.db, world.id, { name: '当前激活玩家', sort_order: 0 });
  const targetPersona = insertPersona(sandbox.db, world.id, { name: '目标玩家', sort_order: 1 });
  sandbox.db.prepare('UPDATE worlds SET active_persona_id = ? WHERE id = ?').run(activePersona.id, world.id);
  insertPersonaStateField(sandbox.db, world.id, {
    field_key: 'gold',
    label: '金币',
    type: 'number',
    default_value: '0',
  });

  const { applyProposal } = await freshImport('assistant/server/normalize-proposal.js');
  await applyProposal({
    type: 'persona-card',
    operation: 'update',
    entityId: world.id,
    personaId: targetPersona.id,
    changes: { name: '目标玩家已更新' },
    stateValueOps: [{ op: 'set', target: 'persona', field_key: 'gold', value_json: '88' }],
  });

  const activeAfter = sandbox.db.prepare('SELECT * FROM personas WHERE id = ?').get(activePersona.id);
  const targetAfter = sandbox.db.prepare('SELECT * FROM personas WHERE id = ?').get(targetPersona.id);
  assert.equal(activeAfter.name, '当前激活玩家');
  assert.equal(targetAfter.name, '目标玩家已更新');

  const activeGold = sandbox.db.prepare(
    'SELECT default_value_json FROM persona_state_values WHERE persona_id = ? AND field_key = ?',
  ).get(activePersona.id, 'gold');
  const targetGold = sandbox.db.prepare(
    'SELECT default_value_json FROM persona_state_values WHERE persona_id = ? AND field_key = ?',
  ).get(targetPersona.id, 'gold');
  assert.equal(activeGold, undefined);
  assert.equal(targetGold.default_value_json, '88');
});
