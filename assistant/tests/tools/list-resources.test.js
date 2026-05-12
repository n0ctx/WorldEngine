import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport } from '../../../backend/tests/helpers/test-env.js';
import { insertWorld, insertCharacter, insertPersona, insertRegexRule } from '../../../backend/tests/helpers/fixtures.js';

const sandbox = createTestSandbox('assistant-list-resources');
sandbox.setEnv();

const listResources = await freshImport('assistant/server/tools/list-resources.js');

after(() => sandbox.cleanup());

test('definition 暴露 list_resources', () => {
  assert.equal(listResources.definition.function.name, 'list_resources');
  assert.deepEqual(listResources.definition.function.parameters.required, ['target']);
});

test('worlds target 返回 JSON', async () => {
  insertWorld(sandbox.db, { name: 'lr-w1' });
  insertWorld(sandbox.db, { name: 'lr-w2' });
  const out = await listResources.execute({ target: 'worlds' });
  const arr = JSON.parse(out);
  assert.ok(Array.isArray(arr));
  assert.ok(arr.some((w) => w.name === 'lr-w1'));
});

test('characters target 缺 worldId 时返回所有角色', async () => {
  const w = insertWorld(sandbox.db, { name: 'lr-w-all' });
  insertCharacter(sandbox.db, w.id, { name: 'lr-c-all' });
  const out = await listResources.execute({ target: 'characters' });
  const arr = JSON.parse(out);
  assert.ok(Array.isArray(arr));
  assert.ok(arr.some((c) => c.name === 'lr-c-all'));
});

test('characters target 按 worldId 返回', async () => {
  const w = insertWorld(sandbox.db, { name: 'lr-w-chars' });
  insertCharacter(sandbox.db, w.id, { name: 'lr-c1' });
  const out = await listResources.execute({ target: 'characters', worldId: w.id });
  const arr = JSON.parse(out);
  assert.equal(arr.length, 1);
  assert.equal(arr[0].name, 'lr-c1');
});

test('personas target 缺 worldId 时返回所有玩家卡', async () => {
  const w = insertWorld(sandbox.db, { name: 'lr-p-all' });
  insertPersona(sandbox.db, w.id, { name: 'lr-p-all' });
  const out = await listResources.execute({ target: 'personas' });
  const arr = JSON.parse(out);
  assert.ok(Array.isArray(arr));
  assert.ok(arr.some((p) => p.name === 'lr-p-all'));
});

test('personas target 按 worldId 返回', async () => {
  const w = insertWorld(sandbox.db, { name: 'lr-w-personas' });
  insertPersona(sandbox.db, w.id, { name: 'lr-p1' });
  const out = await listResources.execute({ target: 'personas', worldId: w.id });
  const arr = JSON.parse(out);
  assert.equal(arr.length, 1);
  assert.equal(arr[0].name, 'lr-p1');
});

test('css-snippets / regex-rules target', async () => {
  insertRegexRule(sandbox.db, { name: 'lr-rr1', pattern: 'a' });
  const css = await listResources.execute({ target: 'css-snippets' });
  assert.ok(Array.isArray(JSON.parse(css)));
  const rr = await listResources.execute({ target: 'regex-rules' });
  const rrArr = JSON.parse(rr);
  assert.ok(rrArr.some((r) => r.name === 'lr-rr1'));
});

test('未知 target 抛错', async () => {
  await assert.rejects(() => listResources.execute({ target: 'unknown' }), /未知 target/);
});

test('结果超过 200 条会被截断', async () => {
  // 直接插 201 条 regex_rule
  for (let i = 0; i < 205; i += 1) {
    insertRegexRule(sandbox.db, { name: `lr-bulk-${i}`, pattern: `${i}` });
  }
  const out = await listResources.execute({ target: 'regex-rules' });
  const parsed = JSON.parse(out);
  assert.equal(parsed._truncated, true);
  assert.equal(parsed.limit, 200);
  assert.ok(parsed.total > 200);
  assert.equal(parsed.data.length, 200);
});
