import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createRouteTestContext } from '../helpers/http.js';
import {
  insertCharacter,
  insertCharacterEntry,
  insertCharacterStateField,
  insertCharacterStateValue,
  insertGlobalEntry,
  insertPersona,
  insertRegexRule,
  insertWorld,
  insertWorldEntry,
} from '../helpers/fixtures.js';

const ctx = createRouteTestContext('import-export-route-suite');

after(() => ctx.close());

test('角色导出与导入路由会保留 prompt entries 并过滤未知状态字段', async () => {

  const sourceWorld = insertWorld(ctx.sandbox.db, { name: '源世界' });
  const targetWorld = insertWorld(ctx.sandbox.db, { name: '目标世界' });
  insertPersona(ctx.sandbox.db, sourceWorld.id, { name: '旅者' });
  insertCharacterStateField(ctx.sandbox.db, sourceWorld.id, { field_key: 'mood', label: '心情' });
  insertCharacterStateField(ctx.sandbox.db, targetWorld.id, { field_key: 'mood', label: '心情' });
  const character = insertCharacter(ctx.sandbox.db, sourceWorld.id, { name: '阿塔', first_message: '你好' });
  insertCharacterEntry(ctx.sandbox.db, character.id, {
    title: '角色设定',
    description: '见面时触发',
    content: '你是阿塔',
    keywords: ['见面'],
  });
  insertCharacterStateValue(ctx.sandbox.db, character.id, { field_key: 'mood', default_value_json: '"平静"' });
  insertCharacterStateValue(ctx.sandbox.db, character.id, { field_key: 'unknown', default_value_json: '"忽略"' });

  let res = await ctx.request(`/api/characters/${character.id}/export`);
  assert.equal(res.status, 200);
  const exported = await res.json();

  assert.equal(exported.character.name, '阿塔');
  assert.equal(exported.prompt_entries.length, 1);
  assert.equal(exported.character_state_values.length, 2);

  res = await ctx.request(`/api/worlds/${targetWorld.id}/import-character`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(exported),
  });
  assert.equal(res.status, 201);
  const imported = await res.json();

  const importedEntries = ctx.sandbox.db.prepare(
    'SELECT title, description, content FROM character_prompt_entries WHERE character_id = ?',
  ).all(imported.id);
  const importedValues = ctx.sandbox.db.prepare(
    'SELECT field_key, default_value_json FROM character_state_values WHERE character_id = ? ORDER BY field_key ASC',
  ).all(imported.id);

  assert.deepEqual(importedEntries, [{ title: '角色设定', description: '见面时触发', content: '你是阿塔' }]);
  assert.deepEqual(importedValues, [{ field_key: 'mood', default_value_json: '"平静"' }]);
});

test('全局设置导出导入会按 mode 替换条目并更新 config', async () => {
  ctx.sandbox.writeConfig({
    ...ctx.sandbox.readConfig(),
    global_system_prompt: '旧系统提示',
    memory_expansion_enabled: true,
    writing: {
      ...ctx.sandbox.readConfig().writing,
      global_system_prompt: '旧写作系统',
      llm: { model: 'old-model', temperature: 0.3, max_tokens: 222 },
    },
  });

  insertGlobalEntry(ctx.sandbox.db, {
    mode: 'chat',
    title: '旧条目',
    description: '旧描述',
    content: '旧内容',
  });
  insertWorldEntry(ctx.sandbox.db, insertWorld(ctx.sandbox.db).id, { title: '不相关', content: '保留' });
  insertRegexRule(ctx.sandbox.db, {
    name: 'chat-rule',
    pattern: '旧',
    replacement: '新',
    scope: 'display_only',
    mode: 'chat',
    world_id: null,
  });

  let res = await ctx.request('/api/global-settings/export?mode=chat');
  assert.equal(res.status, 200);
  const exported = await res.json();
  assert.equal(exported.mode, 'chat');
  assert.equal(exported.global_prompt_entries.length, 1);

  res = await ctx.request('/api/global-settings/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      format: 'worldengine-global-settings-v1',
      mode: 'writing',
      global_prompt_entries: [
        { title: '写作条目', description: '写作描述', content: '写作内容', keyword_scope: 'both' },
      ],
      custom_css_snippets: [
        { name: '纸张', content: '.paper { color: red; }', enabled: true, sort_order: 0 },
      ],
      regex_rules: [
        { name: '换词', pattern: 'foo', replacement: 'bar', scope: 'prompt_only', enabled: true, sort_order: 1 },
      ],
      writing: {
        global_system_prompt: '新的写作系统',
        context_history_rounds: 6,
        llm: { model: 'writer-model', temperature: 0.9, max_tokens: 666 },
      },
    }),
  });
  assert.equal(res.status, 200);

  const saved = ctx.sandbox.readConfig();
  assert.equal(saved.writing.global_system_prompt, '新的写作系统');
  assert.equal(saved.writing.context_history_rounds, 6);
  assert.equal(saved.writing.llm.model, 'writer-model');

  const entries = ctx.sandbox.db.prepare(
    'SELECT title, description, keyword_scope, mode FROM global_prompt_entries ORDER BY sort_order ASC',
  ).all();
  assert.deepEqual(entries, [{
    title: '旧条目',
    description: '旧描述',
    keyword_scope: 'user,assistant',
    mode: 'chat',
  }, {
    title: '写作条目',
    description: '写作描述',
    keyword_scope: 'user,assistant',
    mode: 'writing',
  }]);
});

test('导入角色卡时非法格式返回 400 且不污染目标世界', async () => {
  const targetWorld = insertWorld(ctx.sandbox.db, { name: '目标世界-非法导入' });

  const beforeCount = ctx.sandbox.db.prepare('SELECT COUNT(*) AS c FROM characters WHERE world_id = ?').get(targetWorld.id).c;
  const res = await ctx.request(`/api/worlds/${targetWorld.id}/import-character`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format: 'bad-format', character: { name: '坏卡' } }),
  });

  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /不支持的角色卡格式/);

  const afterCount = ctx.sandbox.db.prepare('SELECT COUNT(*) AS c FROM characters WHERE world_id = ?').get(targetWorld.id).c;
  assert.equal(afterCount, beforeCount);
});

test('导入角色卡时缺少必填字段返回 400 且不创建角色', async () => {
  const targetWorld = insertWorld(ctx.sandbox.db, { name: '目标世界-缺字段' });

  const res = await ctx.request(`/api/worlds/${targetWorld.id}/import-character`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      format: 'worldengine-character-v1',
      character: {},
      prompt_entries: [],
      character_state_values: [],
    }),
  });

  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /character\.name/);
  const count = ctx.sandbox.db.prepare('SELECT COUNT(*) AS c FROM characters WHERE world_id = ?').get(targetWorld.id).c;
  assert.equal(count, 0);
});

test('导入世界卡时未知字段会被忽略而合法字段正常导入', async () => {
  const res = await ctx.request('/api/worlds/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      format: 'worldengine-world-v1',
      world: { name: '未知字段世界', system_prompt: '设定', unknown_key: 'ignored' },
      prompt_entries: [],
      world_state_fields: [],
      character_state_fields: [],
      persona_state_fields: [],
      world_state_values: [],
      persona_state_values: [],
      characters: [],
      extra_payload: { hello: 'world' },
    }),
  });

  assert.equal(res.status, 201);
  const world = await res.json();
  const row = ctx.sandbox.db.prepare('SELECT name, system_prompt FROM worlds WHERE id = ?').get(world.id);
  assert.deepEqual(row, { name: '未知字段世界', system_prompt: '设定' });
});

test('导入世界卡时缺少必填字段返回 400 且不创建世界', async () => {
  const beforeCount = ctx.sandbox.db.prepare('SELECT COUNT(*) AS c FROM worlds').get().c;

  const res = await ctx.request('/api/worlds/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      format: 'worldengine-world-v1',
      world: {},
      prompt_entries: [],
      world_state_fields: [],
      character_state_fields: [],
      persona_state_fields: [],
      world_state_values: [],
      persona_state_values: [],
      characters: [],
    }),
  });

  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /world\.name/);
  const afterCount = ctx.sandbox.db.prepare('SELECT COUNT(*) AS c FROM worlds').get().c;
  assert.equal(afterCount, beforeCount);
});

test('导入世界卡时角色状态字段非法导致事务回滚，不保留半成品世界', async () => {
  const beforeCount = ctx.sandbox.db.prepare('SELECT COUNT(*) AS c FROM worlds').get().c;

  const res = await ctx.request('/api/worlds/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      format: 'worldengine-world-v1',
      world: { name: '冲突世界' },
      prompt_entries: [],
      world_state_fields: [],
      character_state_fields: [],
      persona_state_fields: [],
      world_state_values: [],
      persona_state_values: [],
      characters: [
        {
          name: '同名角色',
          prompt_entries: [],
          character_state_values: [{ field_key: 'mood', value_json: '"平静"' }],
        },
      ],
    }),
  });

  assert.equal(res.status, 201);
  const world = await res.json();
  const afterCount = ctx.sandbox.db.prepare('SELECT COUNT(*) AS c FROM worlds').get().c;
  assert.equal(afterCount, beforeCount + 1);
  const importedValues = ctx.sandbox.db.prepare(
    `SELECT COUNT(*) AS c
     FROM character_state_values csv
     JOIN characters c ON c.id = csv.character_id
     WHERE c.world_id = ?`,
  ).get(world.id).c;
  assert.equal(importedValues, 0);
});

test('全局设置导入非法包返回 400 且不清空原有数据', async () => {
  const beforeCount = ctx.sandbox.db.prepare(`SELECT COUNT(*) AS c FROM global_prompt_entries WHERE mode = 'chat'`).get().c;
  insertGlobalEntry(ctx.sandbox.db, {
    mode: 'chat',
    title: '保留条目',
    description: '保留描述',
    content: '保留内容',
  });

  const res = await ctx.request('/api/global-settings/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format: 'bad-global-package' }),
  });

  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: '全局设置文件格式不正确' });
  const count = ctx.sandbox.db.prepare(`SELECT COUNT(*) AS c FROM global_prompt_entries WHERE mode = 'chat'`).get().c;
  assert.equal(count, beforeCount + 1);
});

test('全局设置导入 writing mode 只替换 writing 资源，不影响 chat 资源', async () => {
  insertGlobalEntry(ctx.sandbox.db, {
    mode: 'chat',
    title: 'chat-entry',
    description: 'chat-desc',
    content: 'chat-content',
  });
  insertGlobalEntry(ctx.sandbox.db, {
    mode: 'writing',
    title: 'old-writing',
    description: 'old-writing-desc',
    content: 'old-writing-content',
  });

  const res = await ctx.request('/api/global-settings/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      format: 'worldengine-global-settings-v1',
      mode: 'writing',
      global_prompt_entries: [{ title: 'new-writing', description: 'new-desc', content: 'new-content' }],
      custom_css_snippets: [],
      regex_rules: [],
      writing: { global_system_prompt: '写作新系统' },
    }),
  });

  assert.equal(res.status, 200);
  const rows = ctx.sandbox.db.prepare(
    'SELECT title, mode FROM global_prompt_entries ORDER BY mode ASC, title ASC',
  ).all();
  assert.ok(rows.some((row) => row.title === 'chat-entry' && row.mode === 'chat'));
  assert.ok(rows.some((row) => row.title === 'new-writing' && row.mode === 'writing'));
  assert.ok(!rows.some((row) => row.title === 'old-writing' && row.mode === 'writing'));
});

test('全局设置导入非法 regex scope 时会跳过坏规则并保留好规则', async () => {
  const res = await ctx.request('/api/global-settings/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      format: 'worldengine-global-settings-v1',
      mode: 'chat',
      global_prompt_entries: [],
      custom_css_snippets: [],
      regex_rules: [
        { name: 'good', pattern: 'a', replacement: 'b', scope: 'display_only' },
        { name: 'bad', pattern: 'x', replacement: 'y', scope: 'invalid_scope' },
      ],
      config: { global_system_prompt: '新的 chat 系统' },
    }),
  });

  assert.equal(res.status, 200);
  const rows = ctx.sandbox.db.prepare(
    'SELECT name, scope FROM regex_rules WHERE world_id IS NULL AND mode = ? ORDER BY name ASC',
  ).all('chat');
  assert.deepEqual(rows, [{ name: 'good', scope: 'display_only' }]);
});
