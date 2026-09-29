import test from 'node:test';
import assert from 'node:assert/strict';

import { useGuardFixture } from './guard-fixture.mjs';

const { makeRoot, write, read, run } = useGuardFixture('check-literals.mjs');

const CLEAN_CSS = `/* color: #fff; font-size: 12px; z-index: 5 */
.clean {
  color: var(--we-color-text-primary);
  background: transparent;
  border-color: currentColor;
  font-size: var(--we-text-sm);
  line-height: normal;
  letter-spacing: 0;
  border-radius: 50%;
  z-index: calc(var(--we-z-modal) + 1);
  box-shadow: var(--we-shadow-md);
  mask-image: linear-gradient(#000, transparent);
  background-image: url("data:image/svg+xml;utf8,<svg fill='%23fff' stroke='#000'/>");
}
.clean-em { font-size: 1.2em; line-height: 0; border-radius: var(--we-radius-md); z-index: auto; letter-spacing: 0px; }
.clean-mix { color: color-mix(in srgb, var(--we-color-accent) 40%, transparent); content: "#fff"; }
`;

const CLEAN_JSX = `export function Clean() {
  return (
    <div
      className="text-[length:var(--we-text-sm)] rounded-[var(--we-radius-md)] bg-[var(--we-color-bg-surface)] p-4 hover:opacity-90"
      style={{ color: 'var(--we-color-text-primary)', fontSize: 'var(--we-text-sm)', zIndex: 'var(--we-z-modal)', borderRadius: '50%' }}
    />
  );
}
`;

function fixture() {
  const root = makeRoot();
  write(root, 'frontend/src/themes/ui.css', CLEAN_CSS);
  write(root, 'frontend/src/components/Clean.jsx', CLEAN_JSX);
  write(root, 'frontend/src/themes/tokens.css', ':root { --we-core-a: #fff; --we-text-sm: 12px; }\n');
  write(root, 'frontend/src/themes/fonts.css', '@font-face { font-family: X; src: url(x.woff2); }\n');
  write(root, 'frontend/src/pages/DesignLabPage/Lab.jsx', "export const Lab = () => <i style={{ color: '#fff' }} className=\"text-sm\" />;\n");
  write(root, 'frontend/src/components/__tests__/x.test.jsx', "export const T = () => <i style={{ color: '#fff' }} />;\n");
  return root;
}

const BAD_CSS = `.bad {
  color: #FFF;
  background: rgb(0, 0, 0);
  border-color: white;
  outline-color: color-mix(in srgb, #123456 50%, transparent);
  fill: var(--we-base-paper-300);
  font-size: 14px;
  line-height: 1.5;
  letter-spacing: 0.05em;
  border-radius: 8px;
  border-top-left-radius: 0.5rem;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  filter: drop-shadow(0 0 4px #abc);
  z-index: 5;
  color: var(--we-color-x, #333);
  padding: var(--we-space-md, 8px);
  margin: var(--we-space-md, 8px);
  width: var(--we-w, 100px);
}
`;

const BAD_JSX = `export function Bad({ open }) {
  return (
    <div
      className={\`text-sm rounded-lg tracking-wide leading-tight font-mono bg-white/50 \${open ? 'text-[13px] bg-[#fff]' : 'hover:rounded-[6px]'}\`}
      style={{ fontSize: 13, zIndex: 10, borderRadius: 8, lineHeight: 1.4, letterSpacing: '0.1em', boxShadow: '0 0 4px rgba(0,0,0,0.2)', color: '#ff0000', '--we-x': 'var(--we-core-ink-900)' }}
    />
  );
}
`;

test('干净的 CSS 与 JSX 通过，注释、mask、data URI、字符串、token 定义文件、设计实验室与测试文件都不算', () => {
  const root = fixture();
  assert.equal(run(root, '--update-baseline').status, 0);
  const result = run(root);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /硬编码字面量 0 处（无）/);
});

test('每条规则的字面量都被报出，并写明改成哪类 token', () => {
  const root = fixture();
  assert.equal(run(root, '--update-baseline').status, 0);
  write(root, 'frontend/src/themes/pages.css', BAD_CSS);
  write(root, 'frontend/src/components/Bad.jsx', BAD_JSX);
  const result = run(root);
  assert.equal(result.status, 1);
  const err = result.stderr;
  const css = 'frontend/src/themes/pages\\.css';
  for (const [rule, value, hint] of [
    ['color', '#fff', '--we-color-\\*'],
    ['color', 'rgb\\(0,0,0\\)', '--we-color-\\*'],
    ['color', 'white', '--we-color-\\*'],
    ['color', '#123456', '--we-color-\\*'],
    ['layer', '--we-base-paper-300', '语义层'],
    ['font-size', '14px', '--we-text-\\*'],
    ['line-height', '1\\.5', '--we-leading-\\*'],
    ['letter-spacing', '0\\.05em', '--we-tracking-\\*'],
    ['radius', '8px', '--we-radius-\\*'],
    ['radius', '0\\.5rem', '--we-radius-\\*'],
    ['shadow', 'rgba\\(0,0,0,0\\.3\\)', '--we-shadow-\\*'],
    ['shadow', '#abc', '--we-shadow-\\*'],
    ['z-index', '5', '--we-z-\\*'],
    ['fallback', '#333', '去掉字面量回退'],
    ['fallback', '8px', '去掉字面量回退'],
    ['fallback', '100px', '去掉字面量回退'],
  ]) {
    assert.match(err, new RegExp(`${css} \\[${rule}\\] ${value}[^\\n]*${hint}`), `${rule} ${value}`);
  }
  const jsx = 'frontend/src/components/Bad\\.jsx';
  for (const [rule, value] of [
    ['tailwind', 'text-sm'], ['tailwind', 'rounded-lg'], ['tailwind', 'tracking-wide'], ['tailwind', 'leading-tight'],
    ['tailwind', 'font-mono'], ['tailwind', 'bg-white/50'], ['tailwind', 'text-\\[13px\\]'], ['tailwind', 'bg-\\[#fff\\]'],
    ['tailwind', 'rounded-\\[6px\\]'],
    ['font-size', '13px'], ['z-index', '10'], ['radius', '8px'], ['line-height', '1\\.4'], ['letter-spacing', '0\\.1em'],
    ['shadow', 'rgba\\(0,0,0,0\\.2\\)'], ['color', '#ff0000'], ['layer', '--we-core-ink-900'],
  ]) {
    assert.match(err, new RegExp(`${jsx} \\[${rule}\\] ${value}[ \\n×]`), `${rule} ${value}`);
  }
  assert.doesNotMatch(err, /padding|margin|width|var\(--we-color-x/);
  assert.doesNotMatch(err, /pages\.css \[color\] #333/);
});

test('现状与基线一致时通过；字面量挪动位置不影响基线；新增、变多失败', () => {
  const root = fixture();
  write(root, 'frontend/src/themes/pages.css', BAD_CSS);
  write(root, 'frontend/src/components/Bad.jsx', BAD_JSX);
  assert.equal(run(root, '--update-baseline').status, 0);
  const baseline = JSON.parse(read(root, 'scripts/literals-baseline.json'));
  assert.equal(baseline.version, 1);
  assert.equal(baseline.literals['frontend/src/themes/pages.css::fallback::8px'], 2);
  assert.equal(run(root).status, 0);

  write(root, 'frontend/src/themes/pages.css', `/* 新增的注释 */\n\n${BAD_CSS}`);
  assert.equal(run(root).status, 0);

  write(root, 'frontend/src/themes/pages.css', `${BAD_CSS}.more { font-size: 20px; }\n`);
  const added = run(root);
  assert.equal(added.status, 1);
  assert.match(added.stderr, /pages\.css \[font-size\] 20px/);

  write(root, 'frontend/src/themes/pages.css', `${BAD_CSS}.more { z-index: 5; }\n`);
  const grew = run(root);
  assert.equal(grew.status, 1);
  assert.match(grew.stderr, /pages\.css::z-index::5: 1 → 2/);
});

test('字面量被改成 token 后基线未收紧算虚挂，更新基线后通过', () => {
  const root = fixture();
  write(root, 'frontend/src/themes/pages.css', BAD_CSS);
  assert.equal(run(root, '--update-baseline').status, 0);
  write(root, 'frontend/src/themes/pages.css', BAD_CSS.replace('font-size: 14px', 'font-size: var(--we-text-sm)'));
  const stale = run(root);
  assert.equal(stale.status, 1);
  assert.match(stale.stderr, /基线与现状对不上[\s\S]*pages\.css::font-size::14px: 记的是 1，实际 0/);
  assert.equal(run(root, '--update-baseline').status, 0);
  assert.equal(run(root).status, 0);
});

test('guard-allow 在 CSS 与 JS 里豁免，并在输出里列出', () => {
  const root = fixture();
  write(root, 'frontend/src/themes/ui.css', `${CLEAN_CSS}
.tag button {
  /* guard-allow(literals): 紧贴 10px 圆形按钮高度 */
  line-height: 10px;
  z-index: 2;

  font-size: 11px;
  z-index: 3;
}
`);
  write(root, 'frontend/src/components/Allowed.jsx', [
    'export function Allowed() {',
    '  // guard-allow(literals): 动画库要求内联数值',
    "  const style = { zIndex: 4, boxShadow: '0 0 2px rgba(0,0,0,0.5)' };",
    '  return <div style={style} />;',
    '}',
    '',
  ].join('\n'));
  const result = run(root);
  assert.equal(result.status, 1);
  assert.doesNotMatch(result.stderr, /line-height|zIndex|\[z-index\] [24]|rgba\(0,0,0,0\.5\)/);
  assert.match(result.stderr, /ui\.css \[font-size\] 11px/);
  assert.match(result.stderr, /ui\.css \[z-index\] 3/);
  assert.match(result.stderr, /有意保留（guard-allow）2 处：\n {2}frontend\/src\/components\/Allowed\.jsx:2 动画库要求内联数值\n {2}frontend\/src\/themes\/ui\.css:\d+ 紧贴 10px 圆形按钮高度/);
});

test('guard-allow 没写理由、守卫名写错、后面没有代码、已无违规都失败', () => {
  const root = fixture();
  write(root, 'frontend/src/themes/ui.css', `${CLEAN_CSS}
.marks {
  /* guard-allow(literals) */
  z-index: 1;
  /* guard-allow(literal): 写错名字 */
  z-index: 2;
  /* guard-allow(literals): 这里其实没有违规 */
  color: var(--we-color-text-primary);

  /* guard-allow(literals): 后面是空行 */

  margin: 0;
}
`);
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /ui\.css:\d+ 标记没写理由/);
  assert.match(result.stderr, /ui\.css:\d+ 守卫名 `literal` 不存在/);
  assert.match(result.stderr, /ui\.css:\d+ 标记后面没有代码可覆盖/);
  assert.match(result.stderr, /ui\.css:\d+ 覆盖的代码里已经没有 literals 违规/);
});

test('CSS 结构不完整、空目录不通过，也不写基线', () => {
  const root = makeRoot();
  write(root, 'frontend/src/themes/ui.css', '.a { color: var(--we-x);\n');
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /ui\.css 的花括号、括号、引号或注释没有配对/);
  const update = run(root, '--update-baseline');
  assert.equal(update.status, 1);
  assert.match(update.stderr, /detector health 不通过/);

  const bad = makeRoot();
  write(bad, 'frontend/src/App.jsx', 'export const = ;\n');
  assert.match(run(bad).stderr, /解析失败：frontend\/src\/App\.jsx/);

  const empty = run(makeRoot());
  assert.equal(empty.status, 1);
  assert.match(empty.stderr, /没有扫到任何文件/);
});
