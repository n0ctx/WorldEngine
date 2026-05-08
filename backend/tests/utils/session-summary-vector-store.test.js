import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createTestSandbox, freshImport } from '../helpers/test-env.js';

const sandbox = createTestSandbox('session-summary-vector-store');
sandbox.setEnv();

const store = await freshImport('backend/utils/session-summary-vector-store.js');

after(() => sandbox.cleanup());

const storePath = path.join(sandbox.root, 'vectors', 'session_summaries.json');

function writeRaw(content) {
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.writeFileSync(storePath, content, 'utf-8');
}

function writeStore(entries) {
  writeRaw(JSON.stringify({ version: 1, entries }));
}

beforeEach(() => {
  if (fs.existsSync(storePath)) fs.unlinkSync(storePath);
});

test('loadStore：文件不存在时返回 EMPTY_STORE 副本', () => {
  const s = store.loadStore();
  assert.deepEqual(s, { version: 1, entries: [] });
});

test('loadStore：文件损坏时返回 EMPTY_STORE 副本', () => {
  writeRaw('{not json');
  assert.deepEqual(store.loadStore(), { version: 1, entries: [] });
});

test('deleteBySessionId：无匹配时不写盘', () => {
  writeStore([{ summary_id: 's1', session_id: 'A', world_id: 'w', vector: [1, 0] }]);
  const mtimeBefore = fs.statSync(storePath).mtimeMs;
  // 等一毫秒以便 mtime 有差别
  const start = Date.now();
  while (Date.now() === start) { /* spin */ }
  store.deleteBySessionId('Z');
  const mtimeAfter = fs.statSync(storePath).mtimeMs;
  assert.equal(mtimeBefore, mtimeAfter);
});

test('deleteBySessionId：匹配时只保留其余条目并写盘', () => {
  writeStore([
    { summary_id: 's1', session_id: 'A', world_id: 'w', vector: [1, 0] },
    { summary_id: 's2', session_id: 'B', world_id: 'w', vector: [0, 1] },
  ]);
  store.deleteBySessionId('A');
  const after = store.loadStore();
  assert.equal(after.entries.length, 1);
  assert.equal(after.entries[0].session_id, 'B');
});

test('search：空 store 直接返回空数组', () => {
  assert.deepEqual(store.search([1, 0], { worldId: 'w', excludeSessionId: 'X' }), []);
});

test('search：worldId 过滤、排除当前 session、相似度阈值、topK 排序、维度不匹配跳过', () => {
  writeStore([
    { summary_id: 's_self', session_id: 'self', world_id: 'w1', vector: [1, 0] },              // 排除 self
    { summary_id: 's_other_world', session_id: 'X', world_id: 'w2', vector: [1, 0] },          // 排除 world 不匹配
    { summary_id: 's_low', session_id: 'Y', world_id: 'w1', vector: [-1, 0] },                 // -1 cos = -1，低于阈值
    { summary_id: 's_high', session_id: 'Z', world_id: 'w1', vector: [1, 0] },                 // 1.0 命中
    { summary_id: 's_mid', session_id: 'M', world_id: 'w1', vector: [0.95, Math.sqrt(1 - 0.95 * 0.95)] }, // 0.95 命中
    { summary_id: 's_dim', session_id: 'D', world_id: 'w1', vector: [1, 0, 0] },               // 维度不匹配
  ]);
  const result = store.search([1, 0], { worldId: 'w1', excludeSessionId: 'self', topK: 5 });
  const ids = result.map((r) => r.summary_id);
  assert.deepEqual(ids, ['s_high', 's_mid']);
  assert.ok(result[0].score >= result[1].score);
});

test('search：topK 截断', () => {
  const v = [1, 0];
  writeStore([
    { summary_id: 'a', session_id: 'A', world_id: 'w', vector: [1, 0] },
    { summary_id: 'b', session_id: 'B', world_id: 'w', vector: [0.99, Math.sqrt(1 - 0.9801)] },
    { summary_id: 'c', session_id: 'C', world_id: 'w', vector: [0.98, Math.sqrt(1 - 0.9604)] },
  ]);
  const result = store.search(v, { worldId: 'w', excludeSessionId: 'X', topK: 2 });
  assert.equal(result.length, 2);
});

test('search：传入零向量 → 余弦分母为 0 时分数为 0，被阈值过滤', () => {
  writeStore([{ summary_id: 's', session_id: 'A', world_id: 'w', vector: [0, 0] }]);
  const result = store.search([1, 0], { worldId: 'w', excludeSessionId: 'X' });
  assert.deepEqual(result, []);
});
