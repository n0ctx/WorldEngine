import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createTestSandbox, freshImport } from '../helpers/test-env.js';

const sandbox = createTestSandbox('themes-service', { ui: { theme: 'classic-parchment' } });
sandbox.setEnv();

after(() => sandbox.cleanup());

test('主题扫描只读内置主题目录，返回当前主题且不带来源字段', async () => {
  const { listThemes } = await freshImport('backend/services/themes.js');
  const data = listThemes();

  assert.equal(data.activeTheme, 'classic-parchment');
  const parchment = data.themes.find((theme) => theme.id === 'classic-parchment');
  assert.ok(parchment);
  assert.deepEqual(Object.keys(parchment).sort(), ['author', 'description', 'id', 'name', 'preview', 'version']);
  assert.equal(data.themes.some((theme) => theme.id.startsWith('_')), false);
});

test('切换主题会写入 config.ui.theme，未知主题被拒绝', async () => {
  const { setActiveTheme } = await freshImport('backend/services/themes.js');
  const result = setActiveTheme('neon-noir');
  assert.equal(result.activeTheme, 'neon-noir');
  assert.equal(sandbox.readConfig().ui.theme, 'neon-noir');
  assert.throws(() => setActiveTheme('no-such'), /主题不存在/);
  assert.throws(() => setActiveTheme('../themes'), /主题不存在/);
});

test('取主题 CSS，未知主题抛错', async () => {
  const { getThemeCss } = await freshImport('backend/services/themes.js');
  assert.match(getThemeCss('classic-parchment'), /--we-base-paper-100/);
  assert.throws(() => getThemeCss('no-such'), /主题不存在/);
});

test('激活主题已不在主题目录时，resolveActiveThemeId 自愈回落到默认主题并持久化', async () => {
  const { resolveActiveThemeId, listThemes } = await freshImport('backend/services/themes.js');

  sandbox.writeConfig({ ...sandbox.readConfig(), ui: { ...sandbox.readConfig().ui, theme: 'ghost' } });

  assert.equal(resolveActiveThemeId(), 'nocturne');
  assert.equal(sandbox.readConfig().ui.theme, 'nocturne');
  assert.equal(listThemes().activeTheme, 'nocturne');
});
