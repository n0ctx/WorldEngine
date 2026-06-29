import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createTestSandbox, freshImport, freshImportUncached } from '../../../backend/tests/helpers/test-env.js';
import { insertWorld, insertCharacter } from '../../../backend/tests/helpers/fixtures.js';

const sandbox = createTestSandbox('assistant-apply-tools');
sandbox.setEnv();

const applyWorldCard = await freshImport('assistant/server/tools/apply-world-card.js');
const applyCharacterCard = await freshImport('assistant/server/tools/apply-character-card.js');
const applyPersonaCard = await freshImport('assistant/server/tools/apply-persona-card.js');
const applyCssSnippet = await freshImport('assistant/server/tools/apply-css-snippet.js');
const applyRegexRule = await freshImport('assistant/server/tools/apply-regex-rule.js');
const applyGlobalConfig = await freshImport('assistant/server/tools/apply-global-config.js');
const applyTheme = await freshImport('assistant/server/tools/apply-theme.js');

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
  // 注意：cf0b31c 起，character-card create 把新主键放在 `id` 字段，`entityId` 仅透传入参（此处是 worldId）。
  // 这一语义与 apply-persona-card 对齐，sub-agent.onApplied 也按 personaId > id > entityId 顺序取 refId。
  assert.ok(created.id, 'character create 必须回填新角色 id');
  const row = sandbox.db.prepare('SELECT id FROM characters WHERE name = ?').get('小明-apply');
  const cid = row?.id;
  assert.ok(cid);
  assert.equal(created.id, cid);

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

test('apply_world_card.execute update 只改 state 条目 conditions（省略 trigger_type 也要落库）', async () => {
  // 回归：已是 state 的条目，子代理常只回传 conditions、不再带 trigger_type。
  // 旧实现在 normalize（按 trigger_type==='state' 才保留 conditions）与 apply
  // （同样按 op.trigger_type==='state' 才 replaceEntryConditions）两层都把 conditions 静默丢弃，
  // 造成「说改了实际没改成功」。修复后 conditions 必须真正写库。
  const created = await applyWorldCard.execute({
    operation: 'create',
    changes: { name: 'cond-world', description: 'd' },
    stateFieldOps: [
      { op: 'create', target: 'world', field_key: 'mood', label: '心情', type: 'text' },
    ],
    entryOps: [
      {
        op: 'create',
        title: '触发条目',
        content: 'c',
        trigger_type: 'state',
        conditions: [{ target_field: '世界.心情', operator: 'eq', value: '开心' }],
      },
    ],
    explanation: '建',
  });
  assert.equal(created.success, true);
  const wid = sandbox.db.prepare('SELECT id FROM worlds WHERE name = ?').get('cond-world')?.id;
  const entryId = sandbox.db.prepare('SELECT id FROM world_prompt_entries WHERE world_id = ?').get(wid)?.id;
  assert.ok(entryId);

  const before = sandbox.db.prepare('SELECT value FROM entry_conditions WHERE entry_id = ?').all(entryId);
  assert.equal(before.length, 1);
  assert.equal(before[0].value, '开心');

  // 关键：update 时只带 conditions，省略 trigger_type
  const updated = await applyWorldCard.execute({
    operation: 'update',
    entityId: wid,
    entryOps: [
      {
        op: 'update',
        id: entryId,
        conditions: [{ target_field: '世界.心情', operator: 'eq', value: '伤心' }],
      },
    ],
  });
  assert.equal(updated.success, true);

  const after = sandbox.db.prepare('SELECT value FROM entry_conditions WHERE entry_id = ?').all(entryId);
  assert.equal(after.length, 1);
  assert.equal(after[0].value, '伤心', 'conditions 必须真正更新到「伤心」');
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

test('apply_theme.execute 走 create/update/delete 全路径（user 层主题）', async () => {
  const themeId = 'test-theme-user';
  const themesDir = path.join(sandbox.root, 'themes');

  const created = await applyTheme.execute({
    operation: 'create',
    entityId: themeId,
    changes: {
      name: '测试主题',
      version: '1.0.0',
      author: 'tester',
      description: 'unit test',
      preview: { paper: '#eeeeee', accent: '#aa0000' },
      css: ':root { --we-base-paper-100: #eeeeee; }',
    },
    explanation: '创建',
  });
  assert.equal(created.success, true);
  assert.equal(created.entityId, themeId);

  const metaPath = path.join(themesDir, themeId, 'theme.json');
  const cssPath = path.join(themesDir, themeId, 'theme.css');
  assert.ok(fs.existsSync(metaPath), 'theme.json 应当被写入');
  assert.ok(fs.existsSync(cssPath), 'theme.css 应当被写入');
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  assert.equal(meta.id, themeId);
  assert.equal(meta.name, '测试主题');
  assert.equal(meta.version, '1.0.0');
  assert.deepEqual(meta.preview, { paper: '#eeeeee', accent: '#aa0000' });

  const updated = await applyTheme.execute({
    operation: 'update',
    entityId: themeId,
    changes: {
      name: '测试主题改名',
      css: ':root { --we-base-paper-100: #ffffff; }',
    },
  });
  assert.equal(updated.success, true);
  const meta2 = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  assert.equal(meta2.name, '测试主题改名');
  assert.equal(meta2.version, '1.0.0'); // 未传字段保留
  assert.match(fs.readFileSync(cssPath, 'utf-8'), /#ffffff/);

  const deleted = await applyTheme.execute({
    operation: 'delete',
    entityId: themeId,
    changes: {},
  });
  assert.equal(deleted.success, true);
  assert.equal(fs.existsSync(path.join(themesDir, themeId)), false);

  assert.equal(applyTheme.definition.name, 'apply_theme');
});

test('apply_theme.execute update 内置主题 → fork 到 user 层，内置不动', async () => {
  // 在 sandbox 里造一个"伪内置主题"：把它放在 REPO_ROOT/themes/<id>/ 之外不行，
  // 因为 services/themes.js 用 process.env.WE_ROOT_THEMES_DIR 覆盖；这里手动覆盖一次。
  const fakeBuiltinRoot = path.join(sandbox.root, 'builtin-themes');
  const builtinId = 'fake-builtin';
  fs.mkdirSync(path.join(fakeBuiltinRoot, builtinId), { recursive: true });
  fs.writeFileSync(
    path.join(fakeBuiltinRoot, builtinId, 'theme.json'),
    JSON.stringify({ id: builtinId, name: '伪内置', version: '1.0.0', preview: {} }, null, 2),
  );
  fs.writeFileSync(
    path.join(fakeBuiltinRoot, builtinId, 'theme.css'),
    ':root { --we-base-paper-100: #111111; }',
  );
  const prevRootEnv = process.env.WE_ROOT_THEMES_DIR;
  process.env.WE_ROOT_THEMES_DIR = fakeBuiltinRoot;
  // services/themes.js 在模块加载时读取 WE_ROOT_THEMES_DIR；用 uncached 重新加载该模块本身即可命中新 env
  const themesService = await freshImportUncached('backend/services/themes.js');

  try {
    const res = themesService.applyAssistantThemeOp({
      id: builtinId,
      operation: 'update',
      changes: { css: ':root { --we-base-paper-100: #222222; }' },
    });
    assert.equal(res.forkedFromBuiltin, true);

    // 内置文件原样
    const builtinCss = fs.readFileSync(path.join(fakeBuiltinRoot, builtinId, 'theme.css'), 'utf-8');
    assert.match(builtinCss, /#111111/);

    // user 层有 fork
    const userDir = path.join(sandbox.root, 'themes', builtinId);
    assert.ok(fs.existsSync(path.join(userDir, 'theme.json')));
    const userCss = fs.readFileSync(path.join(userDir, 'theme.css'), 'utf-8');
    assert.match(userCss, /#222222/);

    // delete 只清 user 层
    const del = themesService.applyAssistantThemeOp({ id: builtinId, operation: 'delete', changes: {} });
    assert.equal(del.deleted, true);
    assert.equal(fs.existsSync(userDir), false);
    assert.ok(fs.existsSync(path.join(fakeBuiltinRoot, builtinId, 'theme.css')), '内置不应被删除');

    // 只有内置时 delete 应拒绝
    assert.throws(
      () => themesService.applyAssistantThemeOp({ id: builtinId, operation: 'delete', changes: {} }),
      /内置主题不能删除/,
    );
  } finally {
    if (prevRootEnv == null) delete process.env.WE_ROOT_THEMES_DIR;
    else process.env.WE_ROOT_THEMES_DIR = prevRootEnv;
  }
});

test('apply_theme.execute 校验：缺 entityId / id 非法 / 已存在（结构化错误，不冒泡）', async () => {
  // 新契约：normalize/apply 抛错被工厂转成结构化结果 { success:false, error_code, message }，
  // 不再 reject，避免冒泡到工具循环触发盲目重试（P0#1）。
  const missing = await applyTheme.execute({ operation: 'create', entityId: null, changes: { name: 'x', version: '1', css: 'a' } });
  assert.equal(missing.success, false);
  assert.match(missing.message, /entityId/);

  const bad = await applyTheme.execute({ operation: 'create', entityId: 'BadID', changes: { name: 'x', version: '1', css: 'a' } });
  assert.equal(bad.success, false);
  assert.match(bad.message, /小写字母开头/);

  // 先建一个，再次 create 同 id 应返回结构化错误
  const ok = await applyTheme.execute({
    operation: 'create',
    entityId: 'dup-theme',
    changes: { name: 'a', version: '1.0.0', css: ':root{}' },
  });
  assert.equal(ok.success, true);
  const dup = await applyTheme.execute({
    operation: 'create',
    entityId: 'dup-theme',
    changes: { name: 'b', version: '1.0.0', css: ':root{}' },
  });
  assert.equal(dup.success, false);
  assert.match(dup.message, /已存在/);
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
