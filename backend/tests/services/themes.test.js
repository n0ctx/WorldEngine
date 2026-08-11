import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createTestSandbox, freshImport } from '../helpers/test-env.js';

const sandbox = createTestSandbox('themes-service', { ui: { theme: 'classic-parchment' } });
sandbox.setEnv();

after(() => sandbox.cleanup());

test('主题扫描合并内置与 data 主题，并返回当前主题', async () => {
  const userDir = path.join(sandbox.root, 'themes', 'ink');
  fs.mkdirSync(userDir, { recursive: true });
  fs.writeFileSync(path.join(userDir, 'theme.json'), JSON.stringify({
    id: 'ink',
    name: '墨色',
    version: '1.0.0',
  }), 'utf-8');
  fs.writeFileSync(path.join(userDir, 'theme.css'), ':root { --we-color-bg-canvas: black; }', 'utf-8');

  const { listThemes } = await freshImport('backend/services/themes.js');
  const data = listThemes();

  assert.equal(data.activeTheme, 'classic-parchment');
  assert.ok(data.themes.some((theme) => theme.id === 'classic-parchment' && theme.builtin));
  assert.ok(data.themes.some((theme) => theme.id === 'ink' && !theme.builtin));
});

test('切换主题会写入 config.ui.theme', async () => {
  const { setActiveTheme } = await freshImport('backend/services/themes.js');
  const result = setActiveTheme('ink');
  assert.equal(result.activeTheme, 'ink');
  assert.equal(sandbox.readConfig().ui.theme, 'ink');
});

test('导入主题校验格式、重复 id 与路径穿越', async () => {
  const { importThemePackage } = await freshImport('backend/services/themes.js');

  assert.throws(() => importThemePackage({}), /格式不正确/);
  assert.throws(() => importThemePackage({
    format: 'worldengine-theme-v1',
    theme: { id: '../bad', name: 'bad', version: '1.0.0' },
    css: '',
  }), /主题 id/);
  assert.throws(() => importThemePackage({
    format: 'worldengine-theme-v1',
    theme: { id: 'ink', name: 'dup', version: '1.0.0' },
    css: '',
  }), /已存在/);

  const imported = importThemePackage({
    format: 'worldengine-theme-v1',
    theme: { id: 'paper2', name: '纸二', version: '1.0.0' },
    css: ':root { --we-color-accent: red; }',
  });
  assert.equal(imported.id, 'paper2');
  assert.ok(fs.existsSync(path.join(sandbox.root, 'themes', 'paper2', 'theme.css')));
});

test('删除主题拒绝内置主题，允许删除用户主题并回退 active theme', async () => {
  const { deleteTheme, setActiveTheme } = await freshImport('backend/services/themes.js');

  assert.throws(() => deleteTheme('classic-parchment'), /内置主题不能删除/);
  setActiveTheme('paper2');
  deleteTheme('paper2');
  // 回退目标是 backend/services/themes.js 的 DEFAULT_THEME_ID（生产默认主题），而非本用例起始 sandbox 值。
  assert.equal(sandbox.readConfig().ui.theme, 'nocturne');
  assert.equal(fs.existsSync(path.join(sandbox.root, 'themes', 'paper2')), false);
});

test('主题目录被磁盘层面直接删除（未经 deleteTheme）时，resolveActiveThemeId 自愈回落到默认主题并持久化', async () => {
  const { setActiveTheme, resolveActiveThemeId, listThemes, importThemePackage } = await freshImport('backend/services/themes.js');

  importThemePackage({
    format: 'worldengine-theme-v1',
    theme: { id: 'ghost', name: '幽灵主题', version: '1.0.0' },
    css: ':root { --we-color-accent: red; }',
  });
  setActiveTheme('ghost');
  assert.equal(sandbox.readConfig().ui.theme, 'ghost');

  // 模拟主题目录被 git checkout / 手动 rm 之类的带外操作删除，而不是走 deleteTheme。
  fs.rmSync(path.join(sandbox.root, 'themes', 'ghost'), { recursive: true, force: true });

  const resolved = resolveActiveThemeId();
  assert.equal(resolved, 'nocturne');
  // 修正结果需要持久化，避免下一次读取仍然拿到失效 id。
  assert.equal(sandbox.readConfig().ui.theme, 'nocturne');

  const data = listThemes();
  assert.equal(data.activeTheme, 'nocturne');
  assert.equal(data.themes.some((theme) => theme.id === 'ghost'), false);
});
