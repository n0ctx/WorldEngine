import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'check-tests.mjs');
const GLOB = '"tests/{*.test.js,!(e2e)/**/*.test.js}"';
const dirs = [];

function write(root, rel, text) {
  mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  writeFileSync(path.join(root, rel), text);
}

function run(root, ...args) {
  return spawnSync(process.execPath, [SCRIPT, '--root', root, ...args], { encoding: 'utf8' });
}

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'we-tests-'));
  dirs.push(root);
  write(root, 'backend/package.json', JSON.stringify({
    scripts: { test: `node --test ${GLOB}`, 'test:coverage': `node --test --experimental-test-coverage ${GLOB}` },
  }));
  write(root, 'backend/tests/a.test.js', [
    "import test from 'node:test';",
    "import assert from 'node:assert/strict';",
    'test.before(() => {});',
    "test('ok', () => { assert.equal(1, 1); });",
    "test('plan', (t) => { t.plan(1); t.assert.ok(true); });",
    "test.skip('pending', () => {});",
    'server.listen(0); server.listen(0);',
    '',
  ].join('\n'));
  write(root, 'backend/tests/e2e/ui.test.js', [
    "import { chromium } from 'playwright';",
    "test('ui', async () => { await page.waitForTimeout(500); expect(1).toBe(1); });",
    '',
  ].join('\n'));
  write(root, 'frontend/src/x.test.jsx', "it('renders', async () => { await sleep(20); expect(1).toBe(1); });\n");
  assert.equal(run(root, '--update-baseline').status, 0);
  return root;
}

after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

test('现状与基线一致时通过', () => {
  const result = run(fixture());
  assert.equal(result.status, 0, result.stderr);
});

test('新增无断言测试、长延迟、playwright 越界、默认命令扫到 e2e 都失败', () => {
  const root = fixture();
  write(root, 'frontend/src/y.test.js', [
    "import { test } from '@playwright/test';",
    "it('no assert', () => { run(); });",
    "it('slow', async () => { await new Promise((r) => setTimeout(r, 51)); expect(1).toBe(1); });",
    '',
  ].join('\n'));
  write(root, 'backend/package.json', JSON.stringify({
    scripts: { test: 'node --test "tests/**/*.test.js"', 'test:coverage': `node --test ${GLOB}` },
  }));
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /「no assert」没有任何断言/);
  assert.match(result.stderr, /setTimeout 延迟 51ms/);
  assert.match(result.stderr, /y\.test\.js:1 playwright 只允许出现在/);
  assert.match(result.stderr, /的 test 会扫到 tests\/e2e/);
  assert.doesNotMatch(result.stderr, /test:coverage 会扫到/);
});

test('基线里的跳过删掉后未清理算虚挂', () => {
  const root = fixture();
  write(root, 'backend/tests/a.test.js', "import assert from 'node:assert';\ntest('ok', () => { assert.ok(1); });\n");
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /基线与现状对不上[\s\S]*a\.test\.js#test\.skip pending/);
  assert.match(result.stderr, /a\.test\.js#listen: 记的是 2，实际 0/);
});
