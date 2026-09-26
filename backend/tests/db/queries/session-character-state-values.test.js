import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport } from '../../helpers/test-env.js';
import {
  insertCharacter,
  insertSession,
  insertSessionCharacterStateValue,
  insertWorld,
} from '../../helpers/fixtures.js';

const sandbox = createTestSandbox('query-session-character-state-values');
sandbox.setEnv();

after(() => sandbox.cleanup());

test('clearSessionCharacterStateValuesByCharacterIds 按参数上限分批并只清理指定角色', async () => {
  const world = insertWorld(sandbox.db);
  const target = insertCharacter(sandbox.db, world.id, { name: '待清理' });
  const kept = insertCharacter(sandbox.db, world.id, { name: '保留' });
  const session = insertSession(sandbox.db, { character_id: target.id, world_id: world.id });
  insertSessionCharacterStateValue(sandbox.db, session.id, target.id, {
    field_key: 'mood',
    runtime_value_json: '"删除"',
  });
  insertSessionCharacterStateValue(sandbox.db, session.id, kept.id, {
    field_key: 'mood',
    runtime_value_json: '"保留"',
  });
  const { clearSessionCharacterStateValuesByCharacterIds } =
    await freshImport('backend/db/queries/session-character-state-values.js');
  const { default: db } = await freshImport('backend/db/index.js');
  const ids = [target.id, ...Array.from({ length: 900 }, (_, index) => `missing-${index}`)];

  let statementCount = 0;
  const prepare = db.prepare;
  db.prepare = (sql) => {
    const statement = prepare(sql);
    if (sql.includes('DELETE FROM session_character_state_values')) {
      const run = statement.run;
      statement.run = (...args) => {
        statementCount++;
        return run(...args);
      };
    }
    return statement;
  };
  try {
    assert.doesNotThrow(() => clearSessionCharacterStateValuesByCharacterIds(session.id, ids));
  } finally {
    db.prepare = prepare;
  }
  assert.equal(statementCount, 2);
  const rows = sandbox.db.prepare(
    'SELECT character_id, runtime_value_json FROM session_character_state_values WHERE session_id = ?',
  ).all(session.id);
  assert.deepEqual(rows, [{ character_id: kept.id, runtime_value_json: '"保留"' }]);
});
