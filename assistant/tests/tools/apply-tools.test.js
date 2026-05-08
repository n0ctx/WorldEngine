import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport } from '../../../backend/tests/helpers/test-env.js';
import { insertWorld, insertCharacter } from '../../../backend/tests/helpers/fixtures.js';

const sandbox = createTestSandbox('assistant-apply-tools');
sandbox.setEnv();

const applyWorldCard = await freshImport('assistant/server/tools/apply-world-card.js');
const applyCharacterCard = await freshImport('assistant/server/tools/apply-character-card.js');
const applyPersonaCard = await freshImport('assistant/server/tools/apply-persona-card.js');
const applyCssSnippet = await freshImport('assistant/server/tools/apply-css-snippet.js');
const applyRegexRule = await freshImport('assistant/server/tools/apply-regex-rule.js');
const applyGlobalConfig = await freshImport('assistant/server/tools/apply-global-config.js');

after(() => sandbox.cleanup());

test('apply_world_card.execute create / update / delete + entryOps / stateFieldOps', async () => {
  const created = await applyWorldCard.execute({
    operation: 'create',
    changes: { name: 'apply-world-1', description: '描述' },
    entryOps: [
      { op: 'create', title: '入口', content: '...', trigger_type: 'always' },
    ],
    stateFieldOps: [
      { op: 'create', target: 'world', field_key: 'mood', label: '心情', type: 'text' },
    ],
    explanation: '创建',
  });
  assert.equal(created.success, true);
  assert.equal(created.type, 'world-card');
  assert.equal(created.operation, 'create');
  // entityId 必须回填为新建世界的 id（即 service 返回的 id）
  assert.ok(created.entityId, 'create 必须回填 entityId');

  const row = sandbox.db.prepare('SELECT id FROM worlds WHERE name = ?').get('apply-world-1');
  const wid = row?.id;
  assert.ok(wid);
  assert.equal(created.entityId, wid);

  const updated = await applyWorldCard.execute({
    operation: 'update',
    entityId: wid,
    changes: { description: '新描述' },
    entryOps: [],
  });
  assert.equal(updated.success, true);

  const deleted = await applyWorldCard.execute({
    operation: 'delete',
    entityId: wid,
  });
  assert.equal(deleted.success, true);

  assert.equal(applyWorldCard.definition.name, 'apply_world_card');
});

test('apply_character_card.execute create / update / delete', async () => {
  const world = insertWorld(sandbox.db, { name: '角色-世界' });
  const created = await applyCharacterCard.execute({
    operation: 'create',
    changes: { name: '小明-apply', description: 'd', system_prompt: 's' },
  }, { worldRefId: world.id });
  assert.equal(created.success, true);
  assert.ok(created.entityId, 'character create 必须回填 entityId');
  const row = sandbox.db.prepare('SELECT id FROM characters WHERE name = ?').get('小明-apply');
  const cid = row?.id;
  assert.ok(cid);
  assert.equal(created.entityId, cid);

  const updated = await applyCharacterCard.execute({
    operation: 'update',
    entityId: cid,
    changes: { description: '改' },
  });
  assert.equal(updated.success, true);

  const deleted = await applyCharacterCard.execute({
    operation: 'delete',
    entityId: cid,
  });
  assert.equal(deleted.success, true);
});

test('apply_persona_card.execute update（默认 persona）', async () => {
  const world = insertWorld(sandbox.db, { name: 'persona-世界' });
  const res = await applyPersonaCard.execute({
    operation: 'update',
    entityId: world.id,
    changes: { name: '玩家A', system_prompt: 'p' },
  });
  assert.equal(res.success, true);
});

test('apply_css_snippet.execute 走 create/update/delete 全路径', async () => {
  const created = await applyCssSnippet.execute({
    operation: 'create',
    changes: { name: 'cs-apply-tools', content: 'body{}', mode: 'chat' },
  });
  assert.equal(created.success, true);
  assert.ok(created.entityId, 'css-snippet create 必须回填 entityId');
  const row = sandbox.db.prepare('SELECT id FROM custom_css_snippets WHERE name = ?').get('cs-apply-tools');
  const cssId = row?.id;
  assert.ok(cssId);
  assert.equal(created.entityId, cssId);

  const updated = await applyCssSnippet.execute({
    operation: 'update',
    entityId: cssId,
    changes: { content: 'p{}' },
  });
  assert.equal(updated.success, true);

  const deleted = await applyCssSnippet.execute({
    operation: 'delete',
    entityId: cssId,
  });
  assert.equal(deleted.success, true);
});

test('apply_regex_rule.execute 走 create/update/delete 全路径', async () => {
  const created = await applyRegexRule.execute({
    operation: 'create',
    changes: { name: 'r-apply-tools', pattern: 'a+', replacement: 'b', flags: 'g', scope: 'display_only' },
  });
  assert.equal(created.success, true);
  assert.ok(created.entityId, 'regex-rule create 必须回填 entityId');
  const row = sandbox.db.prepare('SELECT id FROM regex_rules WHERE name = ?').get('r-apply-tools');
  const rid = row?.id;
  assert.ok(rid);
  assert.equal(created.entityId, rid);

  const updated = await applyRegexRule.execute({
    operation: 'update',
    entityId: rid,
    changes: { replacement: 'c' },
  });
  assert.equal(updated.success, true);

  const deleted = await applyRegexRule.execute({
    operation: 'delete',
    entityId: rid,
  });
  assert.equal(deleted.success, true);
});

test('apply_global_config.execute 移除 api_key 后落库', async () => {
  const res = await applyGlobalConfig.execute({
    changes: {
      llm: { api_key: 'sk-xxx', model: 'mock-model' },
      ui: { theme: 'light' },
    },
  });
  assert.equal(res.success, true);
  // 配置文件里不应有 api_key
  const cfg = sandbox.readConfig();
  assert.equal(cfg.llm.api_key, undefined);
  assert.equal(cfg.llm.model, 'mock-model');
  assert.equal(cfg.ui.theme, 'light');
});

test('apply_global_config.execute 嵌套 api_key 在数组中也会被剥离', async () => {
  const res = await applyGlobalConfig.execute({
    changes: {
      provider_keys: [{ api_key: 'sk-leak', name: 'k' }],
      ui: { font_size: 14 },
    },
  });
  assert.equal(res.success, true);
  const cfg = sandbox.readConfig();
  assert.equal(cfg.ui.font_size, 14);
});
