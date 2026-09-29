import test from 'node:test';
import assert from 'node:assert/strict';

import { useGuardFixture } from './guard-fixture.mjs';

const { makeRoot, write, run } = useGuardFixture('check-theme-alignment.mjs');

const CORE = ':root { --we-color-bg-canvas: #111; --we-color-accent: #f90; --we-space-md: 12px; }\n';

function fixture({ core = CORE, template = ':root { --we-color-bg-canvas: #111; --we-color-accent: #f90; }\n', theme = ':root { --we-color-accent: #09f; }\n' } = {}) {
  const root = makeRoot();
  write(root, 'frontend/src/themes/tokens.css', core);
  write(root, 'frontend/src/themes/fonts.css', '');
  write(root, 'themes/_template/theme.css', template);
  write(root, 'themes/sample/theme.css', theme);
  return root;
}

test('模板列全了内核视觉 token、主题没有孤悬覆盖：通过；主题少覆盖只提示，不失败', () => {
  const result = run(fixture());
  assert.equal(result.status, 0, result.stdout);
  assert.match(result.stdout, /三层对齐检查通过/);
  assert.match(result.stdout, /\[C\] 主题缺失（themes\/sample\/theme\.css）/);
});

test('内核新增了视觉 token 而模板没列：失败，并点名 token', () => {
  const root = fixture({ core: `${CORE}:root { --we-color-bg-new: #222; }\n` });
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /\[A\] 模板盲区/);
  assert.match(result.stdout, /--we-color-bg-new/);
});

test('主题覆盖了内核里不存在的 token：失败，并点名主题与 token', () => {
  const root = fixture({ theme: ':root { --we-color-accent: #09f; --we-color-gone: #fff; }\n' });
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /\[B\] 孤悬覆盖（themes\/sample\/theme\.css）/);
  assert.match(result.stdout, /--we-color-gone/);
});

test('不属于主题视觉范围的 token（间距等）不要求出现在模板里', () => {
  const result = run(fixture({ core: `${CORE}:root { --we-space-lg: 20px; --we-z-modal: 50; }\n` }));
  assert.equal(result.status, 0, result.stdout);
});
