import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport } from '../../helpers/test-env.js';
import { insertCharacter, insertWorld } from '../../helpers/fixtures.js';

const sandbox = createTestSandbox('query-characters-batch');
sandbox.setEnv();

after(() => sandbox.cleanup());

test('getCharactersByIds：单条查询保持输入顺序、重复 ID 和缺失 ID 语义', async () => {
  const world = insertWorld(sandbox.db);
  const first = insertCharacter(sandbox.db, world.id, { name: '甲' });
  const second = insertCharacter(sandbox.db, world.id, { name: '乙' });
  const { getCharactersByIds } = await freshImport('backend/db/queries/characters.js');

  const rows = getCharactersByIds([second.id, 'missing', first.id, second.id]);
  assert.deepEqual(rows.map((row) => row.id), [second.id, first.id, second.id]);
  assert.deepEqual(getCharactersByIds([]), []);
});

test('getCharactersByIds：请求多个角色时仍只准备并执行一条查询', async () => {
  const world = insertWorld(sandbox.db);
  const characters = Array.from({ length: 40 }, (_, index) =>
    insertCharacter(sandbox.db, world.id, { name: `角色${index}` }));
  const { getCharactersByIds } = await freshImport('backend/db/queries/characters.js');
  const { default: db } = await freshImport('backend/db/index.js');

  let prepared = 0;
  let executed = 0;
  const prepare = db.prepare;
  db.prepare = (sql) => {
    const statement = prepare(sql);
    if (sql.includes('FROM characters WHERE id IN')) {
      prepared++;
      const all = statement.all;
      statement.all = (...args) => {
        executed++;
        return all(...args);
      };
    }
    return statement;
  };
  let rows;
  try {
    rows = getCharactersByIds(characters.map((character) => character.id));
  } finally {
    db.prepare = prepare;
  }

  assert.equal(prepared, 1);
  assert.equal(executed, 1);
  assert.deepEqual(rows.map((row) => row.id), characters.map((character) => character.id));
});
