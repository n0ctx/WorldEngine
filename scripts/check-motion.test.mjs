import test from 'node:test';
import assert from 'node:assert/strict';

import { useGuardFixture } from './guard-fixture.mjs';

const { makeRoot, write, run } = useGuardFixture('check-motion.mjs');

const MOTION_JS = `export const MOTION = {
  state: { duration: 0.18, ease: [0.22, 1, 0.36, 1] },
  loop: { duration: 1.2 },
};
export const STAGGER = 0.05;
`;
const TOKENS = `:root {
  --we-motion-state-duration: 180ms;
  --we-motion-state-easing: cubic-bezier(.22, 1, .36, 1);
  --we-motion-loop-duration: 1200ms;
  --we-motion-stagger: 50ms;
}
`;
const PACKS_JS = `export const MOTION_PACKS = {
  calm: { id: 'calm', rhythm: {} },
  slow: { id: 'slow', rhythm: { state: { duration: 0.3 } } },
};
`;
const CALM_CSS = ':root[data-motion="calm"] {\n  --we-fx-enter: fade 1s;\n  --calm-beat: 300ms;\n}\n';
const SLOW_CSS = `:root[data-motion="slow"] {
  --we-fx-enter: rise 1s;
  --we-motion-state-duration: 300ms;
}
@media (prefers-reduced-motion: reduce) {
  :root[data-motion="slow"] { --we-motion-state-duration: 0ms; }
}
`;

function fixture({ tokens = TOKENS, calm = CALM_CSS, slow = SLOW_CSS } = {}) {
  const root = makeRoot();
  write(root, 'frontend/src/core/utils/motion.js', MOTION_JS);
  write(root, 'frontend/src/core/motion/motionPack.js', PACKS_JS);
  write(root, 'frontend/src/themes/tokens.css', tokens);
  write(root, 'frontend/src/themes/ui.css', '.a { animation: var(--we-fx-enter); }\n');
  for (const rel of ['shell', 'state', 'rules', 'settings', 'assistant', 'pages', 'chat'].map((n) => `themes/${n}.css`).concat('index.css')) {
    write(root, `frontend/src/${rel}`, '');
  }
  write(root, 'frontend/src/themes/motion/calm.css', calm);
  write(root, 'frontend/src/themes/motion/slow.css', slow);
  return root;
}

test('角色 JS 与 CSS 一致、包的节奏改写两边同值、边界与接口完整：通过', () => {
  const result = run(fixture());
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /2 个动效包/);
});

test('角色默认值漂移、CSS 多出角色：失败并点名', () => {
  const result = run(fixture({ tokens: TOKENS.replace('180ms', '200ms').replace('}', '  --we-motion-page-duration: 300ms;\n}') }));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--we-motion-state-duration = 200ms，应为 180ms/);
  assert.match(result.stderr, /MOTION 没有 page/);
});

test('包的节奏改写 JS 与 CSS 不一致、CSS 多写了角色：失败并点名', () => {
  const result = run(fixture({ slow: SLOW_CSS.replace('300ms', '280ms').replace('rise 1s;', 'rise 1s;\n  --we-motion-loop-duration: 2s;') }));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /包 slow：--we-motion-state-duration CSS 是 280ms，JS rhythm 是 300ms/);
  assert.match(result.stderr, /包 slow：slow\.css 改写了 --we-motion-loop-duration，JS 的 rhythm 里没有/);
});

test('包占用核心命名、漏给核心引用的接口、多给核心不用的接口：失败并点名', () => {
  const result = run(fixture({ calm: ':root[data-motion="calm"] {\n  --we-cut: steps(1);\n  --we-fx-extra: none;\n}\n' }));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /包 calm：声明了核心命名的 --we-cut/);
  assert.match(result.stderr, /包 calm：核心样式引用了 --we-fx-enter，calm\.css 没声明/);
  assert.match(result.stderr, /包 calm：声明了 --we-fx-extra，核心样式没有引用/);
});
