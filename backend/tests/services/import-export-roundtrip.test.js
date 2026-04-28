import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport, writeUploadFile } from '../helpers/test-env.js';
import {
  insertCharacter,
  insertCharacterStateField,
  insertCharacterStateValue,
  insertPersona,
  insertPersonaStateField,
  insertPersonaStateValue,
  insertRegexRule,
  insertWorld,
  insertWorldEntry,
  insertWorldStateField,
  insertWorldStateValue,
} from '../helpers/fixtures.js';

const sandbox = createTestSandbox('import-export-roundtrip');
sandbox.setEnv();

const {
  exportWorld,
  importWorld,
  exportCharacter,
  importCharacter,
  exportGlobalSettings,
  importGlobalSettings,
} = await freshImport('backend/services/import-export.js');

after(() => sandbox.cleanup());

function stripExportMeta(payload) {
  const cloned = structuredClone(payload);
  delete cloned.exported_at;
  return cloned;
}

function normalizeWorldPackage(payload) {
  const cloned = stripExportMeta(payload);
  if (cloned.world) {
    delete cloned.world.cover_path;
  }
  for (const character of cloned.characters ?? []) {
    delete character.avatar_path;
  }
  for (const entry of cloned.prompt_entries ?? []) {
    if (Array.isArray(entry.conditions)) {
      entry.conditions = entry.conditions.map(({ target_field, operator, value }) => ({
        target_field,
        operator,
        value,
      }));
    }
  }
  return cloned;
}

function normalizeCharacterPackage(payload) {
  const cloned = stripExportMeta(payload);
  if (cloned.character) {
    delete cloned.character.avatar_path;
  }
  return cloned;
}

test('世界卡 round-trip 保持世界/状态/角色结构等价', async () => {
  const world = insertWorld(sandbox.db, {
    name: '圆环世界',
    description: '用于 round-trip 的世界',
    temperature: 0.45,
    max_tokens: 333,
    cover_path: 'avatars/world-cover.png',
  });
  writeUploadFile(sandbox, 'avatars/world-cover.png', 'world-cover');

  insertPersona(sandbox.db, world.id, {
    name: '见证者',
    system_prompt: '记录一切的人',
  });
  insertWorldEntry(sandbox.db, world.id, {
    title: '常驻法则',
    description: 'cached entry',
    content: '第一条法则',
    trigger_type: 'always',
    token: 0,
    sort_order: 0,
  });
  const stateEntry = insertWorldEntry(sandbox.db, world.id, {
    title: '状态法则',
    description: 'state entry',
    content: '只有风暴来临时触发',
    trigger_type: 'state',
    token: 2,
    sort_order: 1,
  });
  sandbox.db.prepare(`
    INSERT INTO entry_conditions (id, entry_id, target_field, operator, value)
    VALUES ('cond-1', ?, '世界.weather', '=', '风暴')
  `).run(stateEntry.id);

  insertWorldStateField(sandbox.db, world.id, {
    field_key: 'weather',
    label: '天气',
    type: 'text',
    default_value: '"晴"',
    sort_order: 0,
  });
  insertWorldStateValue(sandbox.db, world.id, {
    field_key: 'weather',
    default_value_json: '"风暴"',
  });
  insertCharacterStateField(sandbox.db, world.id, {
    field_key: 'mood',
    label: '心情',
    type: 'text',
    default_value: '"平静"',
    sort_order: 0,
  });
  insertPersonaStateField(sandbox.db, world.id, {
    field_key: 'trust',
    label: '信任',
    type: 'number',
    default_value: '0',
    sort_order: 0,
  });
  insertPersonaStateValue(sandbox.db, world.id, {
    field_key: 'trust',
    default_value_json: '8',
  });

  const character = insertCharacter(sandbox.db, world.id, {
    name: '诺拉',
    system_prompt: '守望者',
    first_message: '欢迎来到圆环世界',
    avatar_path: 'avatars/nora.png',
    sort_order: 0,
  });
  writeUploadFile(sandbox, 'avatars/nora.png', 'nora-avatar');
  insertCharacterStateValue(sandbox.db, character.id, {
    field_key: 'mood',
    default_value_json: '"警觉"',
  });

  const exported = exportWorld(world.id);
  const imported = importWorld(exported);
  const reExported = exportWorld(imported.id);

  assert.deepEqual(normalizeWorldPackage(reExported), normalizeWorldPackage(exported));
});

test('角色卡 round-trip 保持角色主体与合法状态值等价', async () => {
  const sourceWorld = insertWorld(sandbox.db, { name: '源世界' });
  const targetWorld = insertWorld(sandbox.db, { name: '目标世界' });
  insertPersona(sandbox.db, sourceWorld.id, { name: '旅者' });
  insertCharacterStateField(sandbox.db, sourceWorld.id, {
    field_key: 'mood',
    label: '心情',
  });
  insertCharacterStateField(sandbox.db, targetWorld.id, {
    field_key: 'mood',
    label: '心情',
  });

  const character = insertCharacter(sandbox.db, sourceWorld.id, {
    name: '阿塔',
    system_prompt: '巡林人',
    first_message: '先别出声',
    avatar_path: 'avatars/ata.png',
  });
  writeUploadFile(sandbox, 'avatars/ata.png', 'ata-avatar');
  insertCharacterStateValue(sandbox.db, character.id, {
    field_key: 'mood',
    default_value_json: '"平静"',
  });

  const exported = exportCharacter(character.id);
  const imported = importCharacter(targetWorld.id, exported);
  const reExported = exportCharacter(imported.id);

  assert.deepEqual(normalizeCharacterPackage(reExported), normalizeCharacterPackage(exported));
});

test('全局设置 round-trip 采用覆盖语义并保留导出内容等价', async () => {
  sandbox.writeConfig({
    ...sandbox.readConfig(),
    global_system_prompt: '全局系统 A',
    global_post_prompt: '全局后置 A',
    context_history_rounds: 7,
    memory_expansion_enabled: true,
  });

  insertRegexRule(sandbox.db, {
    name: 'chat-enabled',
    pattern: 'alpha',
    replacement: 'beta',
    scope: 'display_only',
    mode: 'chat',
    enabled: 1,
    sort_order: 0,
    world_id: null,
  });
  sandbox.db.prepare(`
    INSERT INTO custom_css_snippets (id, name, content, enabled, mode, sort_order, created_at, updated_at)
    VALUES ('css-chat-1', '纸张样式', '.paper { color: sienna; }', 1, 'chat', 0, 1, 1)
  `).run();
  sandbox.db.prepare(`
    INSERT INTO custom_css_snippets (id, name, content, enabled, mode, sort_order, created_at, updated_at)
    VALUES ('css-writing-1', '写作样式', '.writing { color: navy; }', 1, 'writing', 0, 1, 1)
  `).run();
  insertRegexRule(sandbox.db, {
    name: 'writing-keep',
    pattern: 'gamma',
    replacement: 'delta',
    scope: 'prompt_only',
    mode: 'writing',
    enabled: 1,
    sort_order: 0,
    world_id: null,
  });

  const exported = exportGlobalSettings('chat');

  sandbox.db.prepare(`
    INSERT INTO custom_css_snippets (id, name, content, enabled, mode, sort_order, created_at, updated_at)
    VALUES ('css-chat-stale', '陈旧样式', '.old { display: none; }', 1, 'chat', 9, 9, 9)
  `).run();
  insertRegexRule(sandbox.db, {
    name: 'chat-stale',
    pattern: 'old',
    replacement: 'new',
    scope: 'display_only',
    mode: 'chat',
    enabled: 1,
    sort_order: 9,
    world_id: null,
  });
  sandbox.writeConfig({
    ...sandbox.readConfig(),
    global_system_prompt: '被覆盖的系统提示',
    global_post_prompt: '被覆盖的后置提示',
    context_history_rounds: 99,
    memory_expansion_enabled: false,
  });

  importGlobalSettings(exported);

  const reExported = exportGlobalSettings('chat');
  assert.deepEqual(stripExportMeta(reExported), stripExportMeta(exported));

  const staleCss = sandbox.db.prepare(
    `SELECT COUNT(*) AS c FROM custom_css_snippets
     WHERE mode = 'chat' AND name = '陈旧样式'`,
  ).get();
  const staleRule = sandbox.db.prepare(
    `SELECT COUNT(*) AS c FROM regex_rules
     WHERE world_id IS NULL AND mode = 'chat' AND name = 'chat-stale'`,
  ).get();
  const writingCss = sandbox.db.prepare(
    `SELECT COUNT(*) AS c FROM custom_css_snippets
     WHERE mode = 'writing' AND name = '写作样式'`,
  ).get();
  const writingRule = sandbox.db.prepare(
    `SELECT COUNT(*) AS c FROM regex_rules
     WHERE world_id IS NULL AND mode = 'writing' AND name = 'writing-keep'`,
  ).get();

  assert.equal(staleCss.c, 0);
  assert.equal(staleRule.c, 0);
  assert.equal(writingCss.c, 1);
  assert.equal(writingRule.c, 1);
});
