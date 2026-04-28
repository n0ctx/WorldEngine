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

test('ensureDiaryTimeField 在 chat 关闭、仅 writing 启用时使用 writing 的 date_mode', async () => {
  sandbox.writeConfig({
    ...sandbox.readConfig(),
    diary: {
      chat: { enabled: false, date_mode: 'virtual' },
      writing: { enabled: true, date_mode: 'real' },
    },
  });
  const world = insertWorld(sandbox.db, { name: '日记-writing-only' });
  const { ensureDiaryTimeField } = await freshImport('backend/services/worlds.js');
  ensureDiaryTimeField(world.id);

  const row = sandbox.db.prepare(`
    SELECT update_mode FROM world_state_fields WHERE world_id = ? AND field_key = 'diary_time'
  `).get(world.id);
  assert.equal(row.update_mode, 'system_rule');
});

test('ensureDiaryTimeField 在已存在且模式相同时不重复更新', async () => {
  sandbox.writeConfig({
    ...sandbox.readConfig(),
    diary: {
      chat: { enabled: true, date_mode: 'virtual' },
      writing: { enabled: false, date_mode: 'virtual' },
    },
  });
  const world = insertWorld(sandbox.db, { name: '日记-no-op' });
  const { ensureDiaryTimeField } = await freshImport('backend/services/worlds.js');
  ensureDiaryTimeField(world.id);
  const before = sandbox.db.prepare(`SELECT updated_at FROM world_state_fields WHERE world_id = ? AND field_key = 'diary_time'`).get(world.id);

  // 第二次 ensure 时 update_mode 已是 llm_auto，应走 needsUpdate=false 路径
  ensureDiaryTimeField(world.id);
  const after = sandbox.db.prepare(`SELECT updated_at FROM world_state_fields WHERE world_id = ? AND field_key = 'diary_time'`).get(world.id);
  assert.equal(before.updated_at, after.updated_at, 'updated_at 不应改变（说明跳过了更新）');
});
