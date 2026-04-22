import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport } from '../../helpers/test-env.js';
import { insertCharacter, insertWorld } from '../../helpers/fixtures.js';

const sandbox = createTestSandbox('query-prompt-entries-suite');
sandbox.setEnv();

after(() => sandbox.cleanup());

test('prompt entries query 会规范化 keyword_scope、支持按 mode 过滤并保留关键词数组', async () => {
  const world = insertWorld(sandbox.db, { name: '条目世界-全局' });
  const character = insertCharacter(sandbox.db, world.id, { name: '阿尔文' });
  const queries = await freshImport('backend/db/queries/prompt-entries.js');

  const g1 = queries.createGlobalEntry({
    title: '全局聊天',
    description: 'desc',
    content: 'chat',
    keyword_scope: 'both',
    keywords: ['火焰'],
    mode: 'chat',
  });
  queries.createGlobalEntry({
    title: '全局写作',
    content: 'writing',
    keyword_scope: ['assistant', 'user', 'assistant'],
    mode: 'writing',
  });
  const c1 = queries.createCharacterEntry({
    character_id: character.id,
    title: '角色条目',
    content: 'char',
    keyword_scope: 'assistant',
    keywords: ['夜色'],
  });

  assert.equal(g1.keyword_scope, 'user,assistant');
  assert.deepEqual(queries.getAllGlobalEntries('chat').map((row) => row.title), ['全局聊天']);
  assert.deepEqual(queries.getCharacterEntryById(c1.id).keywords, ['夜色']);
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

test('updateCharacterEntry 在空 patch 时返回现有记录，不会破坏排序与数据', async () => {
  const world = insertWorld(sandbox.db, { name: '条目世界-空更新' });
  const character = insertCharacter(sandbox.db, world.id, { name: '芙兰' });
  const queries = await freshImport('backend/db/queries/prompt-entries.js');
  const created = queries.createCharacterEntry({
    character_id: character.id,
    title: '原条目',
    content: '内容',
    sort_order: 5,
  });

  const same = queries.updateCharacterEntry(created.id, {});
  assert.equal(same.id, created.id);
  assert.equal(same.sort_order, 5);
  assert.equal(same.title, '原条目');
});
