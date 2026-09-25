import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'check-duplication.mjs');
const dirs = [];

const block = (name) => `export function ${name}(items) {
  let total = 0;
  for (const item of items) {
    if (item.enabled && item.value > 10) total += item.value * 2;
    else total -= item.value;
  }
  return total;
}
`;

function write(root, rel, text) {
  mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  writeFileSync(path.join(root, rel), text);
}

function run(root, ...args) {
  return spawnSync(process.execPath, [SCRIPT, '--root', root, ...args], { encoding: 'utf8' });
}

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'we-dup-'));
  dirs.push(root);
  write(root, 'backend/a.js', block('sumA'));
  write(root, 'backend/b.js', block('sumB'));
  write(root, 'backend/tests/c.test.js', block('sumC'));
  assert.equal(run(root, '--update-baseline').status, 0);
  return root;
}

after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

test('现状与基线一致时通过', () => {
  const result = run(fixture());
  assert.equal(result.status, 0, result.stderr);
});

test('同一文件里新复制一段失败', () => {
  const root = fixture();
  const loop = 'for (const row of rows) { if (row.id > 3 && row.name !== "x") { out.push({ id: row.id, name: row.name, tag: "t" }); } }\n';
  write(root, 'frontend/src/d.js', `const out = [];\n${loop}console.log(out.length);\n${loop}`);
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /frontend\/src\/d\.js:2-2、frontend\/src\/d\.js:4-4/);
});

test('基线里的重复消失后未清理算虚挂', () => {
  const root = fixture();
  write(root, 'backend/b.js', 'export const b = 1;\n');
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /基线与现状对不上/);
});
