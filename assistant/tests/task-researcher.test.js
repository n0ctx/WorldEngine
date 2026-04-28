import test from 'node:test';
import assert from 'node:assert/strict';

import { freshImport } from '../../backend/tests/helpers/test-env.js';

test('inferTargets 会基于上下文和需求推断探索目标', async () => {
  const { __testables } = await freshImport('assistant/server/task-researcher.js');

  assert.deepEqual(
    __testables.inferTargets('修复当前世界的状态机条目', { worldId: 'world-1' }),
    ['world-card'],
  );
  assert.deepEqual(
    __testables.inferTargets('调整角色开场白', { worldId: 'world-1', characterId: 'char-1' }),
    ['character-card', 'world-card'],
  );
});

test('inferOperation 会识别写入意图', async () => {
  const { __testables } = await freshImport('assistant/server/task-researcher.js');

  assert.equal(__testables.inferOperation('删除这个世界'), 'delete');
  assert.equal(__testables.inferOperation('修复当前角色卡'), 'update');
  assert.equal(__testables.inferOperation('创建一个新世界'), 'create');
});
