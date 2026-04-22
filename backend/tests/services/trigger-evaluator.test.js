/**
 * trigger-evaluator.test.js — evaluateCondition 纯函数单元测试 + 集成测试
 *
 * 纯函数测试：evaluateCondition（无需数据库）
 * 集成测试：collectStateValues、evaluateTriggers（使用 sandbox DB）
 */

/**
 * 注意：不静态 import trigger-evaluator.js（或其任何依赖 db 的模块），
 * 原因是 ES 模块静态 import 会在 sandbox.setEnv() 之前执行，导致 db/index.js
 * 用默认路径初始化，后续 freshImport 的依赖链会复用缓存中的 db 连接，读到错误数据库。
 * 纯函数测试也改为 freshImport + async，保持一致。
 */

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createTestSandbox, freshImport } from '../helpers/test-env.js';
import {
  insertWorld,
  insertCharacter,
  insertSession,
  insertWorldStateField,
  insertCharacterStateField,
  insertCharacterStateValue,
  insertSessionWorldStateValue,
  insertSessionCharacterStateValue,
} from '../helpers/fixtures.js';

// ─── sandbox（所有测试共享） ──────────────────────────────────────────
const sandbox = createTestSandbox('trigger-evaluator-integration');
sandbox.setEnv();
after(() => sandbox.cleanup());

// evaluateCondition 通过 freshImport 加载（避免静态 import 引发 db 模块过早初始化）
// 所有测试使用 async，在函数内部获取 evaluateCondition
describe('evaluateCondition — 数值操作符', () => {
  test('> : 当前值大于阈值时返回 true', async () => {
    const { evaluateCondition } = await freshImport('backend/services/trigger-evaluator.js');
    const stateMap = new Map([['凛.好感度', '60']]);
    assert.strictEqual(evaluateCondition({ target_field: '凛.好感度', operator: '>', value: '50' }, stateMap), true);
  });

  test('> : 当前值等于阈值时返回 false', async () => {
    const { evaluateCondition } = await freshImport('backend/services/trigger-evaluator.js');
    const stateMap = new Map([['凛.好感度', '50']]);
    assert.strictEqual(evaluateCondition({ target_field: '凛.好感度', operator: '>', value: '50' }, stateMap), false);
  });

  test('<= : 当前值等于阈值时返回 true', async () => {
    const { evaluateCondition } = await freshImport('backend/services/trigger-evaluator.js');
    const stateMap = new Map([['世界.戒严等级', '4']]);
    assert.strictEqual(evaluateCondition({ target_field: '世界.戒严等级', operator: '<=', value: '4' }, stateMap), true);
  });

  test('<= : 当前值小于阈值时返回 true', async () => {
    const { evaluateCondition } = await freshImport('backend/services/trigger-evaluator.js');
    const stateMap = new Map([['世界.戒严等级', '3']]);
    assert.strictEqual(evaluateCondition({ target_field: '世界.戒严等级', operator: '<=', value: '4' }, stateMap), true);
  });

  test('<= : 当前值大于阈值时返回 false', async () => {
    const { evaluateCondition } = await freshImport('backend/services/trigger-evaluator.js');
    const stateMap = new Map([['世界.戒严等级', '5']]);
    assert.strictEqual(evaluateCondition({ target_field: '世界.戒严等级', operator: '<=', value: '4' }, stateMap), false);
  });

  test('!= : 当前值不等于阈值时返回 true', async () => {
    const { evaluateCondition } = await freshImport('backend/services/trigger-evaluator.js');
    const stateMap = new Map([['世界.戒严等级', '3']]);
    assert.strictEqual(evaluateCondition({ target_field: '世界.戒严等级', operator: '!=', value: '5' }, stateMap), true);
  });

  test('!= : 当前值等于阈值时返回 false', async () => {
    const { evaluateCondition } = await freshImport('backend/services/trigger-evaluator.js');
    const stateMap = new Map([['世界.戒严等级', '5']]);
    assert.strictEqual(evaluateCondition({ target_field: '世界.戒严等级', operator: '!=', value: '5' }, stateMap), false);
  });

  test('< : 当前值小于阈值时返回 true', async () => {
    const { evaluateCondition } = await freshImport('backend/services/trigger-evaluator.js');
    const stateMap = new Map([['世界.戒严等级', '2']]);
    assert.strictEqual(evaluateCondition({ target_field: '世界.戒严等级', operator: '<', value: '5' }, stateMap), true);
  });

  test('>= : 当前值等于阈值时返回 true', async () => {
    const { evaluateCondition } = await freshImport('backend/services/trigger-evaluator.js');
    const stateMap = new Map([['凛.好感度', '50']]);
    assert.strictEqual(evaluateCondition({ target_field: '凛.好感度', operator: '>=', value: '50' }, stateMap), true);
  });

  test('= : 数值等于时返回 true', async () => {
    const { evaluateCondition } = await freshImport('backend/services/trigger-evaluator.js');
    const stateMap = new Map([['凛.好感度', '50']]);
    assert.strictEqual(evaluateCondition({ target_field: '凛.好感度', operator: '=', value: '50' }, stateMap), true);
  });
});

describe('evaluateCondition — 文本操作符', () => {
  test('包含 : 当前值包含子串时返回 true', async () => {
    const { evaluateCondition } = await freshImport('backend/services/trigger-evaluator.js');
    const stateMap = new Map([['玩家.状态', '严重受伤']]);
    assert.strictEqual(evaluateCondition({ target_field: '玩家.状态', operator: '包含', value: '受伤' }, stateMap), true);
  });

  test('包含 : 当前值不包含子串时返回 false', async () => {
    const { evaluateCondition } = await freshImport('backend/services/trigger-evaluator.js');
    const stateMap = new Map([['玩家.状态', '正常']]);
    assert.strictEqual(evaluateCondition({ target_field: '玩家.状态', operator: '包含', value: '受伤' }, stateMap), false);
  });

  test('等于 : 当前值完全匹配时返回 true', async () => {
    const { evaluateCondition } = await freshImport('backend/services/trigger-evaluator.js');
    const stateMap = new Map([['玩家.状态', '正常']]);
    assert.strictEqual(evaluateCondition({ target_field: '玩家.状态', operator: '等于', value: '正常' }, stateMap), true);
  });

  test('等于 : 当前值不匹配时返回 false', async () => {
    const { evaluateCondition } = await freshImport('backend/services/trigger-evaluator.js');
    const stateMap = new Map([['玩家.状态', '受伤']]);
    assert.strictEqual(evaluateCondition({ target_field: '玩家.状态', operator: '等于', value: '正常' }, stateMap), false);
  });

  test('不包含 : 当前值不包含子串时返回 true', async () => {
    const { evaluateCondition } = await freshImport('backend/services/trigger-evaluator.js');
    const stateMap = new Map([['玩家.状态', '正常']]);
    assert.strictEqual(evaluateCondition({ target_field: '玩家.状态', operator: '不包含', value: '受伤' }, stateMap), true);
  });

  test('不包含 : 当前值包含子串时返回 false', async () => {
    const { evaluateCondition } = await freshImport('backend/services/trigger-evaluator.js');
    const stateMap = new Map([['玩家.状态', '严重受伤']]);
    assert.strictEqual(evaluateCondition({ target_field: '玩家.状态', operator: '不包含', value: '受伤' }, stateMap), false);
  });
});

describe('evaluateCondition — 字段不存在', () => {
  test('字段不在 stateMap 中时返回 false', async () => {
    const { evaluateCondition } = await freshImport('backend/services/trigger-evaluator.js');
    const stateMap = new Map();
    assert.strictEqual(evaluateCondition({ target_field: '凛.好感度', operator: '>', value: '50' }, stateMap), false);
  });

  test('空 stateMap 对文本操作符也返回 false', async () => {
    const { evaluateCondition } = await freshImport('backend/services/trigger-evaluator.js');
    const stateMap = new Map();
    assert.strictEqual(evaluateCondition({ target_field: '玩家.状态', operator: '等于', value: '正常' }, stateMap), false);
  });
});

// ─── 集成测试：collectStateValues ────────────────────────────────────

describe('collectStateValues — 世界状态收集', () => {
  test('收集 session_world_state_values 中的运行时值', async () => {
    const world = insertWorld(sandbox.db, { name: '天气世界' });
    const char = insertCharacter(sandbox.db, world.id, { name: '旅行者' });
    const session = insertSession(sandbox.db, {
      world_id: world.id,
      character_id: char.id,
      mode: 'chat',
    });

    // 插入世界状态字段
    insertWorldStateField(sandbox.db, world.id, {
      field_key: 'weather',
      label: '天气',
      type: 'text',
    });

    // 插入 session 运行时覆盖值（runtime_value_json 为 JSON 字符串）
    insertSessionWorldStateValue(sandbox.db, session.id, world.id, {
      field_key: 'weather',
      runtime_value_json: JSON.stringify('晴天'),
    });

    const { collectStateValues } = await freshImport('backend/services/trigger-evaluator.js');
    const map = collectStateValues(world.id, session.id);

    assert.ok(map.has('世界.天气'), 'stateMap 应包含 "世界.天气" 键');
    assert.equal(map.get('世界.天气'), '晴天');
  });

  test('字段存在但无运行时值时，使用 default_value 回退', async () => {
    const world = insertWorld(sandbox.db, { name: '默认值世界' });
    const char = insertCharacter(sandbox.db, world.id, { name: '守卫' });
    const session = insertSession(sandbox.db, {
      world_id: world.id,
      character_id: char.id,
      mode: 'chat',
    });

    // 插入字段，带 default_value
    insertWorldStateField(sandbox.db, world.id, {
      field_key: 'alert_level',
      label: '戒备等级',
      type: 'number',
      default_value: '3',
    });
    // 不插入 session 运行时值

    const { collectStateValues } = await freshImport('backend/services/trigger-evaluator.js');
    const map = collectStateValues(world.id, session.id);

    assert.ok(map.has('世界.戒备等级'), 'stateMap 应包含 "世界.戒备等级" 键');
    assert.equal(map.get('世界.戒备等级'), '3');
  });

  test('chat 会话角色状态统一收集为 "角色.xxx"', async () => {
    const world = insertWorld(sandbox.db, { name: '角色状态世界' });
    const char = insertCharacter(sandbox.db, world.id, { name: '阿尔托利亚' });
    const session = insertSession(sandbox.db, {
      world_id: world.id,
      character_id: char.id,
      mode: 'chat',
    });

    insertCharacterStateField(sandbox.db, world.id, {
      field_key: 'hp',
      label: '生命值',
      type: 'number',
      default_value: '100',
    });
    insertCharacterStateValue(sandbox.db, char.id, {
      field_key: 'hp',
      default_value_json: JSON.stringify(75),
    });
    insertSessionCharacterStateValue(sandbox.db, session.id, char.id, {
      field_key: 'hp',
      runtime_value_json: JSON.stringify(42),
    });

    const { collectStateValues } = await freshImport('backend/services/trigger-evaluator.js');
    const map = collectStateValues(world.id, session.id);

    assert.equal(map.get('角色.生命值'), '42');
    assert.equal(map.has('阿尔托利亚.生命值'), false);
  });
});

// ─── 集成测试：evaluateTriggers ──────────────────────────────────────

describe('evaluateTriggers — notify 动作', () => {
  test('条件满足时返回 notifications', async () => {
    const world = insertWorld(sandbox.db, { name: '通知测试世界' });
    const char = insertCharacter(sandbox.db, world.id, { name: '主角' });
    const session = insertSession(sandbox.db, {
      world_id: world.id,
      character_id: char.id,
      mode: 'chat',
    });

    insertWorldStateField(sandbox.db, world.id, {
      field_key: 'affection',
      label: '好感度',
      type: 'number',
    });
    insertSessionWorldStateValue(sandbox.db, session.id, world.id, {
      field_key: 'affection',
      runtime_value_json: JSON.stringify(60),
    });

    const {
      createTrigger,
      replaceTriggerConditions,
      insertTriggerAction,
    } = await freshImport('backend/db/queries/triggers.js');

    const trigger = createTrigger({ world_id: world.id, name: '好感度触发器' });
    replaceTriggerConditions(trigger.id, [
      { target_field: '世界.好感度', operator: '>', value: '50' },
    ]);
    insertTriggerAction(trigger.id, 'notify', { text: '触发了！' });

    const { evaluateTriggers } = await freshImport('backend/services/trigger-evaluator.js');
    const result = evaluateTriggers(world.id, session.id, 1);

    assert.equal(result.notifications.length, 1);
    assert.equal(result.notifications[0].text, '触发了！');
    assert.equal(result.notifications[0].name, '好感度触发器');
  });

  test('条件不满足时 notifications 为空', async () => {
    const world = insertWorld(sandbox.db, { name: '不触发世界' });
    const char = insertCharacter(sandbox.db, world.id, { name: '路人' });
    const session = insertSession(sandbox.db, {
      world_id: world.id,
      character_id: char.id,
      mode: 'chat',
    });

    insertWorldStateField(sandbox.db, world.id, {
      field_key: 'affection2',
      label: '好感度2',
      type: 'number',
    });
    insertSessionWorldStateValue(sandbox.db, session.id, world.id, {
      field_key: 'affection2',
      runtime_value_json: JSON.stringify(30),
    });

    const {
      createTrigger,
      replaceTriggerConditions,
      insertTriggerAction,
    } = await freshImport('backend/db/queries/triggers.js');

    const trigger = createTrigger({ world_id: world.id, name: '不满足触发器' });
    replaceTriggerConditions(trigger.id, [
      { target_field: '世界.好感度2', operator: '>', value: '50' },
    ]);
    insertTriggerAction(trigger.id, 'notify', { text: '不该出现' });

    const { evaluateTriggers } = await freshImport('backend/services/trigger-evaluator.js');
    const result = evaluateTriggers(world.id, session.id, 1);

    assert.equal(result.notifications.length, 0);
  });
});

describe('evaluateTriggers — one_shot 禁用', () => {
  test('one_shot=1 触发后 enabled 变为 0', async () => {
    const world = insertWorld(sandbox.db, { name: 'one_shot 世界' });
    const char = insertCharacter(sandbox.db, world.id, { name: '勇者' });
    const session = insertSession(sandbox.db, {
      world_id: world.id,
      character_id: char.id,
      mode: 'chat',
    });

    insertWorldStateField(sandbox.db, world.id, {
      field_key: 'hp_low',
      label: '生命值',
      type: 'number',
    });
    insertSessionWorldStateValue(sandbox.db, session.id, world.id, {
      field_key: 'hp_low',
      runtime_value_json: JSON.stringify(10),
    });

    const {
      createTrigger,
      replaceTriggerConditions,
      insertTriggerAction,
      getTriggerById,
    } = await freshImport('backend/db/queries/triggers.js');

    const trigger = createTrigger({ world_id: world.id, name: 'one_shot触发器', one_shot: 1 });
    replaceTriggerConditions(trigger.id, [
      { target_field: '世界.生命值', operator: '<', value: '50' },
    ]);
    insertTriggerAction(trigger.id, 'notify', { text: '濒死警告' });

    const { evaluateTriggers } = await freshImport('backend/services/trigger-evaluator.js');
    const result = evaluateTriggers(world.id, session.id, 1);

    assert.equal(result.notifications.length, 1, '应触发一次');

    // 从 DB 重新读取，验证 enabled 已变为 0
    const updated = getTriggerById(trigger.id);
    assert.equal(updated.enabled, 0, 'one_shot 触发后 enabled 应为 0');
  });
});

describe('evaluateTriggers — AND 多条件逻辑', () => {
  test('AND 逻辑：只有全部条件满足才触发', async () => {
    const world = insertWorld(sandbox.db, { name: 'AND逻辑世界' });
    const char = insertCharacter(sandbox.db, world.id, { name: '骑士' });
    const session = insertSession(sandbox.db, {
      world_id: world.id,
      character_id: char.id,
      mode: 'chat',
    });

    insertWorldStateField(sandbox.db, world.id, {
      field_key: 'strength',
      label: '力量',
      type: 'number',
    });
    insertWorldStateField(sandbox.db, world.id, {
      field_key: 'agility',
      label: '敏捷',
      type: 'number',
    });

    // 力量满足 (> 50)，敏捷不满足 (< 20，但实际值 30)
    insertSessionWorldStateValue(sandbox.db, session.id, world.id, {
      field_key: 'strength',
      runtime_value_json: JSON.stringify(80),
    });
    insertSessionWorldStateValue(sandbox.db, session.id, world.id, {
      field_key: 'agility',
      runtime_value_json: JSON.stringify(30),
    });

    const {
      createTrigger,
      replaceTriggerConditions,
      insertTriggerAction,
    } = await freshImport('backend/db/queries/triggers.js');

    const trigger = createTrigger({ world_id: world.id, name: 'AND触发器' });
    replaceTriggerConditions(trigger.id, [
      { target_field: '世界.力量', operator: '>', value: '50' },   // 满足
      { target_field: '世界.敏捷', operator: '<', value: '20' },   // 不满足（30 < 20 为 false）
    ]);
    insertTriggerAction(trigger.id, 'notify', { text: '双条件触发' });

    const { evaluateTriggers } = await freshImport('backend/services/trigger-evaluator.js');
    const result = evaluateTriggers(world.id, session.id, 1);

    assert.equal(result.notifications.length, 0, 'AND 条件未全部满足，不应触发');
  });

  test('AND 逻辑：全部条件满足时触发', async () => {
    const world = insertWorld(sandbox.db, { name: 'AND全满足世界' });
    const char = insertCharacter(sandbox.db, world.id, { name: '法师' });
    const session = insertSession(sandbox.db, {
      world_id: world.id,
      character_id: char.id,
      mode: 'chat',
    });

    insertWorldStateField(sandbox.db, world.id, {
      field_key: 'mana',
      label: '魔力',
      type: 'number',
    });
    insertWorldStateField(sandbox.db, world.id, {
      field_key: 'focus',
      label: '专注度',
      type: 'number',
    });

    insertSessionWorldStateValue(sandbox.db, session.id, world.id, {
      field_key: 'mana',
      runtime_value_json: JSON.stringify(100),
    });
    insertSessionWorldStateValue(sandbox.db, session.id, world.id, {
      field_key: 'focus',
      runtime_value_json: JSON.stringify(90),
    });

    const {
      createTrigger,
      replaceTriggerConditions,
      insertTriggerAction,
    } = await freshImport('backend/db/queries/triggers.js');

    const trigger = createTrigger({ world_id: world.id, name: 'AND全满足触发器' });
    replaceTriggerConditions(trigger.id, [
      { target_field: '世界.魔力', operator: '>=', value: '100' },   // 满足
      { target_field: '世界.专注度', operator: '>', value: '80' },   // 满足
    ]);
    insertTriggerAction(trigger.id, 'notify', { text: '魔力全开！' });

    const { evaluateTriggers } = await freshImport('backend/services/trigger-evaluator.js');
    const result = evaluateTriggers(world.id, session.id, 1);

    assert.equal(result.notifications.length, 1, 'AND 条件全满足，应触发');
    assert.equal(result.notifications[0].text, '魔力全开！');
  });
});

describe('evaluateTriggers — writing 模式角色 OR 语义', () => {
  test('条件含 "角色." 时，对会话内任一角色满足即触发', async () => {
    const world = insertWorld(sandbox.db, { name: '多角色世界' });
    const merlin = insertCharacter(sandbox.db, world.id, { name: '梅林' });
    const artoria = insertCharacter(sandbox.db, world.id, { name: '阿尔托利亚' });
    const session = insertSession(sandbox.db, {
      world_id: world.id,
      character_id: null,
      mode: 'writing',
    });

    sandbox.db.prepare(`
      INSERT INTO writing_session_characters (id, session_id, character_id, created_at)
      VALUES (?, ?, ?, ?), (?, ?, ?, ?)
    `).run(
      crypto.randomUUID(), session.id, merlin.id, Date.now(),
      crypto.randomUUID(), session.id, artoria.id, Date.now() + 1,
    );

    insertCharacterStateField(sandbox.db, world.id, {
      field_key: 'hp',
      label: '生命值',
      type: 'number',
      default_value: '100',
    });
    insertSessionCharacterStateValue(sandbox.db, session.id, merlin.id, {
      field_key: 'hp',
      runtime_value_json: JSON.stringify(80),
    });
    insertSessionCharacterStateValue(sandbox.db, session.id, artoria.id, {
      field_key: 'hp',
      runtime_value_json: JSON.stringify(10),
    });

    const {
      createTrigger,
      replaceTriggerConditions,
      insertTriggerAction,
    } = await freshImport('backend/db/queries/triggers.js');

    const trigger = createTrigger({ world_id: world.id, name: '濒危通知' });
    replaceTriggerConditions(trigger.id, [
      { target_field: '角色.生命值', operator: '<', value: '20' },
    ]);
    insertTriggerAction(trigger.id, 'notify', { text: '有人濒危' });

    const { evaluateTriggers } = await freshImport('backend/services/trigger-evaluator.js');
    const result = evaluateTriggers(world.id, session.id, 1);

    assert.equal(result.notifications.length, 1);
    assert.equal(result.notifications[0].text, '有人濒危');
  });
});
