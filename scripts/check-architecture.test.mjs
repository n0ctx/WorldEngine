import test from 'node:test';
import assert from 'node:assert/strict';

import { useGuardFixture } from './guard-fixture.mjs';

const { makeRoot, write, read, run } = useGuardFixture('check-architecture.mjs');

// 合法分层：server 初始化连接，查询层用连接，服务层调查询函数；前端经 features/assistant 接入本地包
function fixture() {
  const root = makeRoot();
  write(root, 'backend/db/index.js', 'export default {};\n');
  write(root, 'backend/server.js', "import db from './db/index.js';\nimport { load } from './services/s.js';\nload(db);\n");
  write(root, 'backend/db/queries/q.js', "import db from '../index.js';\nexport const get = () => db;\n");
  write(root, 'backend/services/s.js', "import { get } from '../db/queries/q.js';\nexport const load = () => get();\n");
  write(root, 'assistant/client/package.json', JSON.stringify({
    name: '@worldengine/assistant-client', exports: { './Panel': './Panel.jsx' },
  }));
  write(root, 'assistant/client/Panel.jsx', 'export default function Panel() { return null; }\n');
  write(root, 'frontend/src/core/features/assistant/index.js',
    "export { default as Panel } from '@worldengine/assistant-client/Panel';\n");
  write(root, 'frontend/src/pages/Home.jsx', "import { Panel } from '../core/features/assistant/index.js';\nexport default Panel;\n");
  return root;
}

test('合法分层通过，并报告解析覆盖、模块数和依赖边（本地包按 exports 解析成依赖边）', () => {
  const result = run(fixture());
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /解析 7\/7 个正式源码文件，7 个模块 \/ 6 条依赖边，越界 0 处/);
});

test('前后端互相导入、绕过 features/assistant 接入助手客户端、db/ 之外导入数据库连接，都作为硬规则失败', () => {
  const root = fixture();
  write(root, 'frontend/src/pages/Bad.jsx', [
    "import '../../../backend/services/s.js';",
    "import Panel from '@worldengine/assistant-client/Panel';",
    'export default Panel;',
    '',
  ].join('\n'));
  write(root, 'backend/services/t.js', "import '../../frontend/src/pages/Home.jsx';\n");
  write(root, 'backend/memory/m.js', "import db from '../db/index.js';\nexport const m = () => db;\n");
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /frontend-to-backend:frontend\/src\/pages\/Bad\.jsx -> backend\/services\/s\.js/);
  assert.match(result.stderr, /backend-to-frontend:backend\/services\/t\.js -> frontend\/src\/pages\/Home\.jsx/);
  assert.match(result.stderr, /assistant-client-entry:frontend\/src\/pages\/Bad\.jsx -> assistant\/client\/Panel\.jsx/);
  assert.match(result.stderr, /db-connection-outside-queries:backend\/memory\/m\.js -> backend\/db\/index\.js/);
});

test('插入无关代码并新增文件不改变已有 finding key', () => {
  const root = fixture();
  write(root, 'backend/memory/m.js', "import db from '../db/index.js';\nexport const m = () => db;\n");
  const key = 'db-connection-outside-queries:backend/memory/m.js -> backend/db/index.js';
  assert.ok(run(root).stderr.includes(key));

  write(root, 'backend/memory/m.js', `const unrelated = 1;\n${read(root, 'backend/memory/m.js')}`);
  write(root, 'backend/memory/other.js', 'export const other = true;\n');
  const after = run(root);
  assert.equal(after.status, 1);
  assert.ok(after.stderr.includes(key));
});

test('解析失败、静态引用或本地包子路径无法解析、空扫描都失败', () => {
  const parseRoot = fixture();
  write(parseRoot, 'backend/bad.js', 'export const = ;\n');
  const parseFailure = run(parseRoot);
  assert.equal(parseFailure.status, 1);
  assert.match(parseFailure.stderr, /解析失败：backend\/bad\.js/);

  const importRoot = fixture();
  write(importRoot, 'frontend/src/core/features/assistant/index.js',
    "export { default } from '@worldengine/assistant-client/Missing';\nimport './missing.js';\n");
  const unresolved = run(importRoot);
  assert.equal(unresolved.status, 1);
  assert.match(unresolved.stderr, /无法解析仓内静态引用：frontend\/src\/core\/features\/assistant\/index\.js -> @worldengine\/assistant-client\/Missing/);
  assert.match(unresolved.stderr, /无法解析仓内静态引用：frontend\/src\/core\/features\/assistant\/index\.js -> \.\/missing\.js/);

  const empty = run(makeRoot());
  assert.equal(empty.status, 1);
  assert.match(empty.stderr, /没有扫到任何正式源码文件/);
});
