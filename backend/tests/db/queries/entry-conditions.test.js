import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestSandbox, freshImport } from '../../helpers/test-env.js';
import { insertWorld, insertWorldEntry } from '../../helpers/fixtures.js';

const sandbox = createTestSandbox('entry-conditions-suite');
sandbox.setEnv();
after(() => sandbox.cleanup());

test('listConditionsByEntry 返回指定条目的所有条件', async () => {
  const world = insertWorld(sandbox.db, { name: '状态条目世界-1' });
  const entry = insertWorldEntry(sandbox.db, world.id, { title: '低血量提示', trigger_type: 'state' });
  const { listConditionsByEntry, replaceEntryConditions } = await freshImport('backend/db/queries/entry-conditions.js');

  replaceEntryConditions(entry.id, [
    { target_field: '世界.体力', operator: '<', value: '30' },
    { target_field: '玩家.心情', operator: '等于', value: '痛苦' },
  ]);

  const conds = listConditionsByEntry(entry.id);
  assert.equal(conds.length, 2);
  assert.equal(conds[0].target_field, '世界.体力');
  assert.equal(conds[0].operator, '<');
  assert.equal(conds[0].value, '30');
});

test('replaceEntryConditions 先删后插（幂等替换）', async () => {
  const world = insertWorld(sandbox.db, { name: '状态条目世界-2' });
  const entry = insertWorldEntry(sandbox.db, world.id, { title: '幂等测试', trigger_type: 'state' });
  const { listConditionsByEntry, replaceEntryConditions } = await freshImport('backend/db/queries/entry-conditions.js');

  replaceEntryConditions(entry.id, [
    { target_field: '世界.体力', operator: '>', value: '50' },
  ]);
  assert.equal(listConditionsByEntry(entry.id).length, 1);

  replaceEntryConditions(entry.id, [
    { target_field: '角色.好感度', operator: '>=', value: '80' },
    { target_field: '世界.戒严', operator: '!=', value: '1' },
  ]);
  const conds = listConditionsByEntry(entry.id);
  assert.equal(conds.length, 2, '替换后应有 2 条，旧条件应被清除');
  assert.equal(conds[0].target_field, '角色.好感度');
});

test('replaceEntryConditions 传空数组清空所有条件', async () => {
  const world = insertWorld(sandbox.db, { name: '状态条目世界-3' });
  const entry = insertWorldEntry(sandbox.db, world.id, { title: '清空测试', trigger_type: 'state' });
  const { listConditionsByEntry, replaceEntryConditions } = await freshImport('backend/db/queries/entry-conditions.js');

  replaceEntryConditions(entry.id, [{ target_field: '世界.体力', operator: '<', value: '10' }]);
  replaceEntryConditions(entry.id, []);
  assert.equal(listConditionsByEntry(entry.id).length, 0);
});

test('entry 删除时 entry_conditions 级联删除', async () => {
  const world = insertWorld(sandbox.db, { name: '状态条目世界-4' });
  const entry = insertWorldEntry(sandbox.db, world.id, { title: '级联删除测试', trigger_type: 'state' });
  const { listConditionsByEntry, replaceEntryConditions } = await freshImport('backend/db/queries/entry-conditions.js');

  replaceEntryConditions(entry.id, [{ target_field: '世界.体力', operator: '<', value: '20' }]);
  sandbox.db.prepare('DELETE FROM world_prompt_entries WHERE id = ?').run(entry.id);
  assert.equal(listConditionsByEntry(entry.id).length, 0, '级联删除后条件应为空');
});
