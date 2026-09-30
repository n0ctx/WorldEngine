import test from 'node:test';
import assert from 'node:assert/strict';

import { useGuardFixture } from './guard-fixture.mjs';

const { makeRoot, write, run } = useGuardFixture('check-theme-alignment.mjs');

const CORE = `:root { --we-base-canvas: #111; --we-base-accent: #f90; --we-color-bg-canvas: var(--we-base-canvas); --we-color-scheme: light; --we-space-md: 12px; --we-elevation-1: 0 1px 2px black; --we-duration-fast: 150ms; }
:root, .we-app-root { --we-color-accent-bg: color-mix(in srgb, var(--we-base-accent) 12%, transparent); --we-focus-ring: 0 0 0 2px red; }
`;

function fixture({ core = CORE, template = ':root { --we-base-canvas: #111; --we-base-accent: #f90; --we-color-scheme: light; }\n', theme = ':root { --we-base-accent: #09f; }\n' } = {}) {
  const root = makeRoot();
  write(root, 'frontend/src/themes/tokens.css', core);
  write(root, 'frontend/src/themes/fonts.css', '');
  write(root, 'themes/_template/theme.css', template);
  write(root, 'themes/sample/theme.css', theme);
  return root;
}

test('模板列全了主题可写 token、主题没有孤悬或越权覆盖：通过；主题少覆盖只提示，不失败', () => {
  const result = run(fixture());
  assert.equal(result.status, 0, result.stdout);
  assert.match(result.stdout, /三层对齐检查通过/);
  assert.match(result.stdout, /\[C\] 主题缺失（themes\/sample\/theme\.css）/);
});

test('内核新增了主题可写 token 而模板没列：失败，并点名 token；推导出的语义色与组合 token 不要求出现在模板里', () => {
  const root = fixture({ core: `${CORE}:root { --we-base-new: #222; --we-color-text-new: var(--we-base-new); }\n` });
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /\[A\] 模板盲区/);
  assert.match(result.stdout, /--we-base-new/);
  assert.doesNotMatch(result.stdout, /--we-color-text-new/);
});

test('主题覆盖了内核里不存在的 token：失败，并点名主题与 token', () => {
  const root = fixture({ theme: ':root { --we-base-accent: #09f; --we-base-gone: #fff; }\n' });
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /\[B\] 孤悬覆盖（themes\/sample\/theme\.css）/);
  assert.match(result.stdout, /--we-base-gone/);
});

test('主题写了白名单以外的核心 token（推导出的语义色、主色作用域、阴影组合）：失败，并点名；白名单里的明暗方案与动效时长放行', () => {
  const root = fixture({ theme: ':root { --we-color-bg-canvas: #000; --we-focus-ring: none; --we-elevation-1: none; --we-color-scheme: dark; --we-duration-fast: 90ms; }\n' });
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /\[D\] 越权覆盖（themes\/sample\/theme\.css）/);
  assert.match(result.stdout, /--we-color-bg-canvas/);
  assert.match(result.stdout, /--we-focus-ring/);
  assert.match(result.stdout, /--we-elevation-1/);
  assert.doesNotMatch(result.stdout, /越权[\s\S]*(--we-color-scheme|--we-duration-fast)/);
});

test('不属于主题视觉范围的 token（间距等）不要求出现在模板里', () => {
  const result = run(fixture({ core: `${CORE}:root { --we-space-lg: 20px; --we-z-modal: 50; }\n` }));
  assert.equal(result.status, 0, result.stdout);
});
