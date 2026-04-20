import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport } from '../helpers/test-env.js';
import { insertRegexRule, insertWorld } from '../helpers/fixtures.js';

const sandbox = createTestSandbox('regex-suite');
sandbox.setEnv();
after(() => sandbox.cleanup());

test('applyRules 按 sort_order 链式执行规则', async () => {
  const world = insertWorld(sandbox.db, { name: '规则链世界' });
  insertRegexRule(sandbox.db, { name: 'first', pattern: '猫', replacement: '狗', sort_order: 0, world_id: world.id });
  insertRegexRule(sandbox.db, { name: 'second', pattern: '狗', replacement: '狼', sort_order: 1, world_id: world.id });

  const { applyRules } = await freshImport('backend/utils/regex-runner.js');
  assert.equal(applyRules('猫来了', 'prompt_only', world.id), '狼来了');
});

test('applyRules 遇到非法规则时跳过但不中断后续规则', async () => {
  const world = insertWorld(sandbox.db, { name: '规则异常世界' });

  insertRegexRule(sandbox.db, { name: 'bad', pattern: '[abc', replacement: 'x', sort_order: 0, world_id: world.id });
  insertRegexRule(sandbox.db, { name: 'good', pattern: 'hero', replacement: 'HERO', flags: 'gi', sort_order: 1, world_id: world.id });

  const { applyRules } = await freshImport('backend/utils/regex-runner.js');
  assert.equal(applyRules('Hero hero', 'prompt_only', world.id), 'HERO HERO');
});

test('applyRules 跳过超长 pattern 规则', async () => {
  const world = insertWorld(sandbox.db, { name: '规则超长世界' });

  insertRegexRule(sandbox.db, {
    name: 'too-long',
    pattern: 'a'.repeat(501),
    replacement: 'x',
    sort_order: 0,
    world_id: world.id,
  });
  insertRegexRule(sandbox.db, {
    name: 'normal',
    pattern: '世界',
    replacement: 'world',
    sort_order: 1,
    world_id: world.id,
  });

  const { applyRules } = await freshImport('backend/utils/regex-runner.js');
  assert.equal(applyRules('世界', 'prompt_only', world.id), 'world');
});
