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
  exportPersona,
  importPersona,
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
  for (const persona of cloned.personas ?? []) {
    delete persona.avatar_path;
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

function normalizePersonaPackage(payload) {
  const cloned = stripExportMeta(payload);
  if (cloned.persona) {
    delete cloned.persona.avatar_path;
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
    description: '记录万象的旅人',
    system_prompt: '记录一切的人',
    avatar_path: 'avatars/persona.png',
  });
  writeUploadFile(sandbox, 'avatars/persona.png', 'persona-avatar');
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
    description: '边境哨兵',
    system_prompt: '守望者',
    post_prompt: '继续保持警觉',
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

test('世界卡 round-trip 带上 accent_color / accent_source（手工指定的主色不丢）', async () => {
  const { updateWorld } = await freshImport('backend/db/queries/worlds.js');
  const world = insertWorld(sandbox.db, { name: '带主色的世界' });
  updateWorld(world.id, { accent_color: '#4477aa', accent_source: 'manual' });

  const exported = exportWorld(world.id);
  assert.equal(exported.world.accent_color, '#4477aa');
  assert.equal(exported.world.accent_source, 'manual');

  const imported = importWorld(exported);
  assert.equal(imported.accent_color, '#4477aa');
  assert.equal(imported.accent_source, 'manual');
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
    description: '巡视林地的猎手',
    system_prompt: '巡林人',
    post_prompt: '保持沉默',
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

test('玩家卡 round-trip 保持玩家主体与合法状态值等价', async () => {
  const sourceWorld = insertWorld(sandbox.db, { name: '源世界-玩家' });
  const targetWorld = insertWorld(sandbox.db, { name: '目标世界-玩家' });
  const persona = insertPersona(sandbox.db, sourceWorld.id, {
    name: '璃音',
    description: '失乡旅人',
    system_prompt: '谨慎观察世界的人',
    avatar_path: 'avatars/persona-hero.png',
  });
  writeUploadFile(sandbox, 'avatars/persona-hero.png', 'persona-hero');
  sandbox.db.prepare('UPDATE worlds SET active_persona_id = ? WHERE id = ?').run(persona.id, sourceWorld.id);
  insertPersonaStateField(sandbox.db, sourceWorld.id, {
    field_key: 'stamina',
    label: '体力',
  });
  insertPersonaStateField(sandbox.db, targetWorld.id, {
    field_key: 'stamina',
    label: '体力',
  });
  insertPersonaStateValue(sandbox.db, sourceWorld.id, {
    persona_id: persona.id,
    field_key: 'stamina',
    default_value_json: '"充沛"',
  });

  const exported = exportPersona(sourceWorld.id);
  const imported = importPersona(targetWorld.id, exported);
  sandbox.db.prepare('UPDATE worlds SET active_persona_id = ? WHERE id = ?').run(imported.id, targetWorld.id);
  const reExported = exportPersona(targetWorld.id);

  assert.deepEqual(normalizePersonaPackage(reExported), normalizePersonaPackage(exported));
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

test('写作模式全局设置只更新有效的 writing 字段', () => {
  const current = sandbox.readConfig();
  const currentWriting = current.writing ?? {};
  const currentLlm = currentWriting.llm ?? {};
  sandbox.writeConfig({
    ...current,
    writing: {
      ...currentWriting,
      global_system_prompt: '旧写作系统提示',
      global_post_prompt: '旧写作后置提示',
      context_history_rounds: 12,
      llm: { ...currentLlm, model: 'old-model' },
    },
  });

  const payload = exportGlobalSettings('writing');
  payload.writing = {
    global_system_prompt: '新的写作系统提示',
    global_post_prompt: '新的写作后置提示',
    context_history_rounds: null,
    llm: {
      provider: 'openai',
      provider_models: { openai: 'gpt-new' },
      base_url: 'https://example.test/v1',
      model: 'gpt-new',
      temperature: 0.75,
      max_tokens: 512,
      thinking_level: 'high',
    },
  };
  payload.custom_css_snippets = [];
  payload.regex_rules = [];

  importGlobalSettings(payload);

  const imported = sandbox.readConfig();
  assert.equal(imported.writing.global_system_prompt, '新的写作系统提示');
  assert.equal(imported.writing.global_post_prompt, '新的写作后置提示');
  assert.equal(imported.writing.context_history_rounds, null);
  assert.deepEqual(imported.writing.llm.provider_models, { openai: 'gpt-new' });
  assert.equal(imported.writing.llm.model, 'gpt-new');
  assert.equal(imported.writing.llm.temperature, 0.75);
  assert.equal(imported.writing.llm.max_tokens, 512);
  assert.equal(imported.writing.llm.thinking_level, 'high');
});

test('旧版单玩家世界卡仍导入玩家状态值', () => {
  const sourceWorld = insertWorld(sandbox.db, { name: '旧版格式源世界' });
  const persona = insertPersona(sandbox.db, sourceWorld.id, { name: '旧卡玩家', system_prompt: '继续旅程' });
  insertPersonaStateField(sandbox.db, sourceWorld.id, { field_key: 'stamina', label: '体力' });
  insertPersonaStateValue(sandbox.db, sourceWorld.id, {
    persona_id: persona.id,
    field_key: 'stamina',
    default_value_json: '7',
  });

  const payload = exportWorld(sourceWorld.id);
  const [legacyPersona] = payload.personas;
  delete payload.personas;
  payload.persona = {
    name: legacyPersona.name,
    description: legacyPersona.description,
    system_prompt: legacyPersona.system_prompt,
    avatar_path: legacyPersona.avatar_path,
  };
  payload.persona_state_values = legacyPersona.persona_state_values;

  const imported = importWorld(payload);
  const reExported = exportWorld(imported.id);
  assert.equal(reExported.personas.length, 1);
  assert.equal(reExported.personas[0].is_active, true);
  assert.deepEqual(reExported.personas[0].persona_state_values, [{ field_key: 'stamina', value_json: '7' }]);
});

test('世界卡数据库导入失败时回滚已插入的世界行', () => {
  const sourceWorld = insertWorld(sandbox.db, { name: '回滚源世界' });
  const payload = exportWorld(sourceWorld.id);
  payload.world_state_fields = [
    { field_key: 'duplicate', label: '重复字段一', type: 'text' },
    { field_key: 'duplicate', label: '重复字段二', type: 'text' },
  ];
  const worldCountBefore = sandbox.db.prepare('SELECT COUNT(*) AS count FROM worlds').get().count;

  assert.throws(() => importWorld(payload));

  const worldCountAfter = sandbox.db.prepare('SELECT COUNT(*) AS count FROM worlds').get().count;
  assert.equal(worldCountAfter, worldCountBefore);
});

test('导入世界卡不会被 createWorld 的默认状态字段种子污染', async () => {
  // 源世界不带任何状态字段定义（模拟一张"没有状态字段"的世界卡）
  const world = insertWorld(sandbox.db, { name: '无状态字段世界' });
  insertPersona(sandbox.db, world.id, { name: '空玩家' });

  const exported = exportWorld(world.id);
  assert.deepEqual(exported.world_state_fields, []);
  assert.deepEqual(exported.persona_state_fields, []);
  assert.deepEqual(exported.character_state_fields, []);

  const imported = importWorld(exported);

  // 导入路径走裸 SQL（INSERT INTO worlds），不经过 services/worlds.js 的 createWorld，
  // 因此不应种下 location/weather/personality/age/appearance/outfit/identity 等默认字段。
  const worldFieldCount = sandbox.db.prepare(
    'SELECT COUNT(*) AS c FROM world_state_fields WHERE world_id = ?',
  ).get(imported.id).c;
  const personaFieldCount = sandbox.db.prepare(
    'SELECT COUNT(*) AS c FROM persona_state_fields WHERE world_id = ?',
  ).get(imported.id).c;
  const characterFieldCount = sandbox.db.prepare(
    'SELECT COUNT(*) AS c FROM character_state_fields WHERE world_id = ?',
  ).get(imported.id).c;

  assert.equal(worldFieldCount, 0);
  assert.equal(personaFieldCount, 0);
  assert.equal(characterFieldCount, 0);
});
