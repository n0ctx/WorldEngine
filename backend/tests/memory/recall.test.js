import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport } from '../helpers/test-env.js';
import {
  insertCharacter,
  insertCharacterStateField,
  insertCharacterStateValue,
  insertPersona,
  insertPersonaStateField,
  insertPersonaStateValue,
  insertSession,
  insertWorld,
  insertWorldStateField,
  insertWorldStateValue,
} from '../helpers/fixtures.js';

const sandbox = createTestSandbox('recall-suite');
sandbox.setEnv();
after(() => sandbox.cleanup());

test('parseValueForDisplay 处理 null、空数组和非法 JSON', async () => {
  const { __testables } = await freshImport('backend/memory/recall.js');
  assert.equal(__testables.parseValueForDisplay(null), null);
  assert.equal(__testables.parseValueForDisplay('[]'), null);
  assert.equal(__testables.parseValueForDisplay('["剑","盾"]'), '剑、盾');
  assert.equal(__testables.parseValueForDisplay('{bad json'), '{bad json');
});

test('renderXxxState 优先读取 session runtime，再回退 default', async () => {
  const world = insertWorld(sandbox.db, { name: '晨曦城' });
  insertPersona(sandbox.db, world.id, { name: '玩家' });
  const character = insertCharacter(sandbox.db, world.id, { name: '莱恩' });
  const session = insertSession(sandbox.db, { character_id: character.id });

  insertWorldStateField(sandbox.db, world.id, { field_key: 'date', label: '日期', default_value: '"初始日"' });
  insertWorldStateValue(sandbox.db, world.id, { field_key: 'date', default_value_json: '"第二日"' });
  sandbox.db.prepare(`
    INSERT INTO session_world_state_values (id, session_id, world_id, field_key, runtime_value_json, updated_at)
    VALUES ('swsv-1', ?, ?, 'date', '"第三日"', ?)
  `).run(session.id, world.id, Date.now());

  insertCharacterStateField(sandbox.db, world.id, { field_key: 'mood', label: '心情', default_value: '"平静"' });
  insertCharacterStateValue(sandbox.db, character.id, { field_key: 'mood', default_value_json: '"警惕"' });
  sandbox.db.prepare(`
    INSERT INTO session_character_state_values (id, session_id, character_id, field_key, runtime_value_json, updated_at)
    VALUES ('scsv-1', ?, ?, 'mood', '"兴奋"', ?)
  `).run(session.id, character.id, Date.now());

  insertPersonaStateField(sandbox.db, world.id, { field_key: 'hp', label: '体力', default_value: '100' });
  insertPersonaStateValue(sandbox.db, world.id, { field_key: 'hp', default_value_json: '80' });
  sandbox.db.prepare(`
    INSERT INTO session_persona_state_values (id, session_id, world_id, field_key, runtime_value_json, updated_at)
    VALUES ('spsv-1', ?, ?, 'hp', '75', ?)
  `).run(session.id, world.id, Date.now());

  const { renderWorldState, renderCharacterState, renderPersonaState } = await freshImport('backend/memory/recall.js');
  assert.match(renderWorldState(world.id, session.id), /第三日/);
  assert.match(renderCharacterState(character.id, session.id), /兴奋/);
  assert.match(renderPersonaState(world.id, session.id), /75/);
});
