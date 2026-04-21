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
