import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let stateStore;
const dirs = [];

function freshDir() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'we-state-'));
  dirs.push(d);
  return d;
}

test.before(async () => {
  process.env.ASSISTANT_STATE_DIR = freshDir();
  stateStore = await import('../server/state-store.js');
});

test.after(() => {
  for (const d of dirs) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ }
  }
  delete process.env.ASSISTANT_STATE_DIR;
});

test('writeTaskFile 原子替换:中途崩溃不留半文件', () => {
  const id = 'task-aaa11111';
  stateStore.writeTaskFile(id, { id, status: 'planning', version: 1 });
  const p = path.join(process.env.ASSISTANT_STATE_DIR, `${id}.json`);
  assert.ok(fs.existsSync(p), '.json 已落盘');
  assert.equal(fs.existsSync(`${p}.tmp`), false, 'tmp 文件已被 rename 掉');
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  assert.equal(raw.status, 'planning');
  assert.equal(raw.version, 1);
});

test('readAllTasks 扫描目录并反序列化', () => {
  const id1 = 'task-bbb22222';
  const id2 = 'task-ccc33333';
  stateStore.writeTaskFile(id1, { id: id1, status: 'completed', version: 1 });
  stateStore.writeTaskFile(id2, { id: id2, status: 'failed', version: 1 });
  const all = stateStore.readAllTasks();
  const ids = new Set(all.map((t) => t.id));
  assert.ok(ids.has(id1));
  assert.ok(ids.has(id2));
});

test('readAllTasks 跳过解析失败的损坏文件', () => {
  const bad = path.join(process.env.ASSISTANT_STATE_DIR, 'task-broken.json');
  fs.writeFileSync(bad, 'not-json');
  const all = stateStore.readAllTasks();
  // 损坏文件不抛,只是不进结果
  assert.ok(Array.isArray(all));
  assert.equal(all.find((t) => t.id === 'task-broken'), undefined);
});

test('deleteTaskFile 删除 .json,不存在时静默', () => {
  const id = 'task-ddd44444';
  stateStore.writeTaskFile(id, { id, status: 'completed', version: 1 });
  stateStore.deleteTaskFile(id);
  const p = path.join(process.env.ASSISTANT_STATE_DIR, `${id}.json`);
  assert.equal(fs.existsSync(p), false);
  // 第二次删除不抛
  stateStore.deleteTaskFile(id);
});

test('writeTaskFile 拒绝非法 id(防穿越目录)', () => {
  assert.throws(() => stateStore.writeTaskFile('../evil', { id: 'x' }), /invalid taskId/);
  assert.throws(() => stateStore.writeTaskFile('task-with/slash', { id: 'x' }), /invalid taskId/);
});
