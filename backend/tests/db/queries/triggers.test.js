import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport } from '../../helpers/test-env.js';
import { insertWorld } from '../../helpers/fixtures.js';

const sandbox = createTestSandbox('query-triggers-suite');
sandbox.setEnv();

after(() => sandbox.cleanup());

test('createTrigger 返回完整记录（id 非空、name 正确、enabled=1、one_shot=0）', async () => {
  const world = insertWorld(sandbox.db, { name: '触发器世界-1' });
  const { createTrigger } = await freshImport('backend/db/queries/triggers.js');

  const trigger = createTrigger({ world_id: world.id, name: '测试触发器' });

  assert.ok(trigger.id, 'id 应非空');
  assert.equal(trigger.name, '测试触发器');
  assert.equal(trigger.enabled, 1);
  assert.equal(trigger.one_shot, 0);
  assert.equal(trigger.world_id, world.id);
});

test('listTriggersByWorld 按世界过滤', async () => {
  const worldA = insertWorld(sandbox.db, { name: '触发器世界-A' });
  const worldB = insertWorld(sandbox.db, { name: '触发器世界-B' });
  const { createTrigger, listTriggersByWorld } = await freshImport('backend/db/queries/triggers.js');

  createTrigger({ world_id: worldA.id, name: 'A触发器1' });
  createTrigger({ world_id: worldA.id, name: 'A触发器2' });
  createTrigger({ world_id: worldB.id, name: 'B触发器1' });

  const listA = listTriggersByWorld(worldA.id);
  const listB = listTriggersByWorld(worldB.id);

  assert.equal(listA.length, 2);
  assert.ok(listA.every(t => t.world_id === worldA.id));
  assert.equal(listB.length, 1);
  assert.equal(listB[0].name, 'B触发器1');
});

test('replaceTriggerConditions 替换已有条件', async () => {
  const world = insertWorld(sandbox.db, { name: '触发器世界-条件' });
  const { createTrigger, replaceTriggerConditions, listConditionsByTrigger } = await freshImport('backend/db/queries/triggers.js');

  const trigger = createTrigger({ world_id: world.id, name: '条件触发器' });

  replaceTriggerConditions(trigger.id, [
    { target_field: 'hp', operator: 'lt', value: '50' },
    { target_field: 'mp', operator: 'gt', value: '100' },
  ]);

  const conditions1 = listConditionsByTrigger(trigger.id);
  assert.equal(conditions1.length, 2);

  // 替换后条件应更新
  replaceTriggerConditions(trigger.id, [
    { target_field: 'stamina', operator: 'eq', value: '0' },
  ]);

  const conditions2 = listConditionsByTrigger(trigger.id);
  assert.equal(conditions2.length, 1);
  assert.equal(conditions2[0].target_field, 'stamina');
  assert.equal(conditions2[0].operator, 'eq');
  assert.equal(conditions2[0].value, '0');
});

test('listConditionsByTrigger 返回指定 trigger 的所有条件', async () => {
  const world = insertWorld(sandbox.db, { name: '触发器世界-条件列表' });
  const { createTrigger, replaceTriggerConditions, listConditionsByTrigger } = await freshImport('backend/db/queries/triggers.js');

  const triggerX = createTrigger({ world_id: world.id, name: 'X触发器' });
  const triggerY = createTrigger({ world_id: world.id, name: 'Y触发器' });

  replaceTriggerConditions(triggerX.id, [
    { target_field: 'level', operator: 'gte', value: '10' },
  ]);
  replaceTriggerConditions(triggerY.id, [
    { target_field: 'gold', operator: 'lte', value: '5' },
    { target_field: 'fame', operator: 'gt', value: '100' },
  ]);

  const condX = listConditionsByTrigger(triggerX.id);
  const condY = listConditionsByTrigger(triggerY.id);

  assert.equal(condX.length, 1);
  assert.equal(condX[0].target_field, 'level');
  assert.equal(condY.length, 2);
});

test('upsertTriggerAction 保存动作（notify 类型，params 含 text）', async () => {
  const world = insertWorld(sandbox.db, { name: '触发器世界-动作' });
  const { createTrigger, upsertTriggerAction, getActionByTriggerId } = await freshImport('backend/db/queries/triggers.js');

  const trigger = createTrigger({ world_id: world.id, name: '动作触发器' });

  const action = upsertTriggerAction(trigger.id, 'notify', { text: '你好世界' });

  assert.ok(action.id, 'action.id 应非空');
  assert.equal(action.trigger_id, trigger.id);
  assert.equal(action.action_type, 'notify');
  assert.deepEqual(action.params, { text: '你好世界' });
});

test('getActionByTriggerId 返回正确动作', async () => {
  const world = insertWorld(sandbox.db, { name: '触发器世界-获取动作' });
  const { createTrigger, upsertTriggerAction, getActionByTriggerId } = await freshImport('backend/db/queries/triggers.js');

  const trigger = createTrigger({ world_id: world.id, name: '获取动作触发器' });
  upsertTriggerAction(trigger.id, 'inject_prompt', { text: '注入提示词', mode: 'persistent' });

  const action = getActionByTriggerId(trigger.id);

  assert.ok(action, '应返回动作记录');
  assert.equal(action.trigger_id, trigger.id);
  assert.equal(action.action_type, 'inject_prompt');
  assert.equal(action.params.text, '注入提示词');
  assert.equal(action.params.mode, 'persistent');
});

test('updateTrigger 修改 enabled/one_shot', async () => {
  const world = insertWorld(sandbox.db, { name: '触发器世界-更新' });
  const { createTrigger, updateTrigger, getTriggerById } = await freshImport('backend/db/queries/triggers.js');

  const trigger = createTrigger({ world_id: world.id, name: '可更新触发器' });
  assert.equal(trigger.enabled, 1);
  assert.equal(trigger.one_shot, 0);

  const updated = updateTrigger(trigger.id, { enabled: 0, one_shot: 1 });
  assert.equal(updated.enabled, 0);
  assert.equal(updated.one_shot, 1);
  assert.ok(updated.updated_at >= trigger.updated_at);

  const fetched = getTriggerById(trigger.id);
  assert.equal(fetched.enabled, 0);
  assert.equal(fetched.one_shot, 1);
});

test('deleteTrigger 后相关数据全部清除', async () => {
  const world = insertWorld(sandbox.db, { name: '触发器世界-删除' });
  const {
    createTrigger, getTriggerById,
    replaceTriggerConditions, listConditionsByTrigger,
    upsertTriggerAction, getActionByTriggerId,
    deleteTrigger,
  } = await freshImport('backend/db/queries/triggers.js');

  const trigger = createTrigger({ world_id: world.id, name: '待删触发器' });
  replaceTriggerConditions(trigger.id, [
    { target_field: 'hp', operator: 'lt', value: '10' },
  ]);
  upsertTriggerAction(trigger.id, 'notify', { text: '即将删除' });

  deleteTrigger(trigger.id);

  assert.equal(getTriggerById(trigger.id), undefined, 'trigger 应已删除');
  assert.deepEqual(listConditionsByTrigger(trigger.id), [], '条件应已级联删除');
  assert.equal(getActionByTriggerId(trigger.id), undefined, '动作应已级联删除');
});
