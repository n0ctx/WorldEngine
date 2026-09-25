import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'check-perf-shape.mjs');
const dirs = [];

function write(root, rel, text) {
  mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  writeFileSync(path.join(root, rel), text);
}

function run(root, ...args) {
  return spawnSync(process.execPath, [SCRIPT, '--root', root, ...args], { encoding: 'utf8' });
}

const QUERIES = `export function reorder(db, ids) {
  const stmt = db.prepare('UPDATE t SET sort = ? WHERE id = ?');
  ids.forEach((id, i) => stmt.run(i, id));
  const all = db.prepare('SELECT * FROM t').all();
  const map = new Map(all.map((r) => [r.id, r]));
  for (const id of ids) map.get(id);
}
`;

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'we-perf-'));
  dirs.push(root);
  write(root, 'backend/db/queries/t.js', QUERIES);
  write(root, 'backend/routes/list.js', "export const sql = 'SELECT id FROM t';\n");
  write(root, 'backend/services/import-export.js', "export const sql = 'SELECT * FROM t';\n");
  write(root, 'frontend/src/grid.js', [
    'export function grid(rows, cols) {',
    '  for (const r of rows) { for (const c of cols) { let n = 0; while (n < 3) n += 1; } }',
    '}',
    '',
  ].join('\n'));
  assert.equal(run(root, '--update-baseline').status, 0);
  return root;
}

after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

test('现状与基线一致时通过，两层循环与内存匹配不报', () => {
  const result = run(fixture());
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /循环内查询 1 处、无 WHERE\/LIMIT 的 SELECT 1 处/);
});

test('三层循环引用外层变量、新增循环内查询、新增无条件 SELECT 都失败', () => {
  const root = fixture();
  write(root, 'frontend/src/deep.js', [
    'export function deep(a, b, c) {',
    '  for (const x of a) { b.forEach((y) => { for (const z of c) { if (z === x) return; } }); }',
    '}',
    '',
  ].join('\n'));
  write(root, 'backend/services/load.js', [
    "export function load(db, ids) { for (const id of ids) db.prepare('SELECT * FROM t WHERE id = ?').get(id); }",
    'export const sql = `SELECT name FROM t ORDER BY name`;',
    '',
  ].join('\n'));
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /deep\.js:2 循环嵌套 3 层，最内层引用了外层循环变量 x/);
  assert.match(result.stderr, /backend\/services\/load\.js#load#db\.prepare/);
  assert.match(result.stderr, /backend\/services\/load\.js#\(顶层\)#SELECT name FROM t ORDER BY name/);
});

test('基线里的循环内查询消失后未清理算虚挂', () => {
  const root = fixture();
  write(root, 'backend/db/queries/t.js', 'export function reorder() {}\n');
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /基线与现状对不上[\s\S]*t\.js#reorder#stmt\.run/);
});
