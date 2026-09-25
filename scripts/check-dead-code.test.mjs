import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'check-dead-code.mjs');
const dirs = [];

function write(root, rel, text) {
  mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  writeFileSync(path.join(root, rel), text);
}

function run(root, ...args) {
  return spawnSync(process.execPath, [SCRIPT, '--root', root, ...args], { encoding: 'utf8' });
}

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'we-dead-'));
  dirs.push(root);
  write(root, 'backend/server.js', "import { used } from './lib.js';\nconst page = await import('./pages/home');\nused(page);\n");
  write(root, 'backend/lib.js', 'export function used() {}\nexport const unused = 1;\n');
  write(root, 'backend/pages/home/index.js', 'export default 1;\n');
  write(root, 'backend/only-tested.js', 'export const x = 1;\n');
  write(root, 'backend/tests/only-tested.test.js', "import { x } from '../only-tested.js';\n");
  write(root, 'hooks/on-save.js', 'export default function hook() {}\n');
  write(root, 'tools/package.json', JSON.stringify({ scripts: { go: 'node ./run.mjs --fast' } }));
  write(root, 'tools/run.mjs', 'export const unusedInEntry = 1;\n');
  assert.equal(run(root, '--update-baseline').status, 0);
  return root;
}

after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

test('现状与基线一致时通过，入口与测试引用不报', () => {
  const root = fixture();
  const result = run(root);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /无引用文件 0 个、无引用导出 1 个/);
});

test('新增无引用文件和无引用导出失败', () => {
  const root = fixture();
  write(root, 'backend/orphan.js', 'export const o = 1;\n');
  write(root, 'backend/lib.js', 'export function used() {}\nexport const unused = 1;\nexport const extra = 2;\n');
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /backend\/orphan\.js/);
  assert.match(result.stderr, /backend\/lib\.js#extra/);
});

test('基线里的无引用导出删掉后未清理算虚挂', () => {
  const root = fixture();
  write(root, 'backend/lib.js', 'export function used() {}\n');
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /基线与现状对不上[\s\S]*backend\/lib\.js#unused/);
});
