import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport } from '../../helpers/test-env.js';
import { insertWorld } from '../../helpers/fixtures.js';

const sandbox = createTestSandbox('query-prompt-entries-suite');
sandbox.setEnv();

after(() => sandbox.cleanup());

test('prompt entries query 会规范化 keyword_scope 并保留关键词数组', async () => {
  const world = insertWorld(sandbox.db, { name: '条目世界-keyword' });
  const queries = await freshImport('backend/db/queries/prompt-entries.js');

  const e1 = queries.createWorldEntry({
    world_id: world.id,
    title: '关键词条目',
    content: '内容',
    keyword_scope: 'both',
    keywords: ['火焰'],
  });
  const e2 = queries.createWorldEntry({
    world_id: world.id,
    title: '助手条目',
    content: '内容',
    keyword_scope: ['assistant', 'user', 'assistant'],
  });

  assert.equal(e1.keyword_scope, 'user,assistant');
  assert.deepEqual(e1.keywords, ['火焰']);
  assert.ok(['user,assistant', 'assistant,user'].includes(e2.keyword_scope));
  assert.deepEqual(queries.getWorldEntryById(e1.id).keywords, ['火焰']);
});

test('prompt entries query 会更新字段并按 owner 范围重排', async () => {
  const world = insertWorld(sandbox.db, { name: '条目世界-重排' });
  const world2 = insertWorld(sandbox.db, { name: '条目世界-其他' });
  const queries = await freshImport('backend/db/queries/prompt-entries.js');

  const a = queries.createWorldEntry({ world_id: world.id, title: 'A', content: 'a' });
  const b = queries.createWorldEntry({ world_id: world.id, title: 'B', content: 'b' });
  const foreign = queries.createWorldEntry({ world_id: world2.id, title: '外部', content: 'x' });

  const updated = queries.updateWorldEntry(a.id, {
    title: 'A2',
    keywords: null,
    keyword_scope: ['assistant'],
  });
  assert.equal(updated.title, 'A2');
  assert.equal(updated.keyword_scope, 'assistant');
  assert.equal(updated.keywords, null);

  queries.reorderWorldEntries(world.id, [b.id, a.id, foreign.id]);

  const worldRows = queries.getAllWorldEntries(world.id);
  const otherRows = queries.getAllWorldEntries(world2.id);
  assert.deepEqual(worldRows.map((row) => row.title), ['B', 'A2']);
  assert.deepEqual(otherRows.map((row) => row.title), ['外部']);
});

test('updateWorldEntry 在空 patch 时返回现有记录，不会破坏排序与数据', async () => {
  const world = insertWorld(sandbox.db, { name: '条目世界-空更新' });
  const queries = await freshImport('backend/db/queries/prompt-entries.js');
  const created = queries.createWorldEntry({
    world_id: world.id,
    title: '原条目',
    content: '内容',
    sort_order: 5,
  });

  const same = queries.updateWorldEntry(created.id, {});
  assert.equal(same.id, created.id);
  assert.equal(same.sort_order, 5);
  assert.equal(same.title, '原条目');
});
