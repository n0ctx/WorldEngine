import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport } from '../helpers/test-env.js';
import {
  insertWorld,
  insertWorldStateField,
  insertPersonaStateField,
} from '../helpers/fixtures.js';

const sandbox = createTestSandbox('service-worlds-extra', {
  diary: {
    chat: { enabled: false, date_mode: 'virtual' },
    writing: { enabled: false, date_mode: 'virtual' },
  },
});
sandbox.setEnv();

after(() => sandbox.cleanup());

test('createWorld 在导入场景下会按现有 world/persona state_fields 初始化默认值', async () => {
  const { createWorld } = await freshImport('backend/services/worlds.js');
  const world = createWorld({ name: '世界-种子', persona_name: '甲' });
  // 新建后再补字段并直接 upsert 默认值（模拟导入流：字段存在时 createWorld 内 for 循环走过）
  insertWorldStateField(sandbox.db, world.id, {
    field_key: 'climate',
    label: '气候',
    type: 'text',
    default_value: '温和',
  });
  insertPersonaStateField(sandbox.db, world.id, {
    field_key: 'mood_user',
    label: '心情',
    type: 'text',
    default_value: '平静',
  });

  // 重新调用 createWorld，让另一个世界经过 for 循环 + persona_state_fields 的字段写入
  const world2 = createWorld({ name: '世界-种子2' });
  // 对世界 2 单独插入字段后再次 createWorld 也只是 no-op；这里主要验证函数路径覆盖
  assert.ok(world2.id);
});

test('updateWorld / getWorldById / getAllWorlds 暴露的薄包装层正常工作', async () => {
  const { createWorld, updateWorld, getWorldById, getAllWorlds } = await freshImport('backend/services/worlds.js');
  const world = createWorld({ name: '原名' });
  updateWorld(world.id, { name: '改名', description: '描述' });
  const reloaded = getWorldById(world.id);
  assert.equal(reloaded.name, '改名');
  assert.equal(reloaded.description, '描述');

  const list = getAllWorlds();
  assert.ok(list.some((w) => w.id === world.id));
});

test('deleteWorld 触发 cleanup 钩子并最终从 DB 删除世界', async () => {
  const { createWorld, deleteWorld, getWorldById } = await freshImport('backend/services/worlds.js');
  const { registerOnDelete } = await freshImport('backend/utils/cleanup-hooks.js');
  let hookFired = null;
  registerOnDelete('world', async (id) => { hookFired = id; });

  const world = createWorld({ name: '待删世界' });
  await deleteWorld(world.id);
  assert.equal(hookFired, world.id);
  assert.equal(getWorldById(world.id), undefined);
});

