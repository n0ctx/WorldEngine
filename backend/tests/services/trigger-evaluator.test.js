/**
 * trigger-evaluator.test.js — evaluateCondition 纯函数单元测试
 *
 * 只测试 evaluateCondition（纯函数，无需数据库），
 * evaluateTriggers 和 collectStateValues 涉及数据库，属于集成测试范围。
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCondition } from '../../services/trigger-evaluator.js';

describe('evaluateCondition — 数值操作符', () => {
  test('> : 当前值大于阈值时返回 true', () => {
    const stateMap = new Map([['凛.好感度', '60']]);
    assert.strictEqual(evaluateCondition({ target_field: '凛.好感度', operator: '>', value: '50' }, stateMap), true);
  });

  test('> : 当前值等于阈值时返回 false', () => {
    const stateMap = new Map([['凛.好感度', '50']]);
    assert.strictEqual(evaluateCondition({ target_field: '凛.好感度', operator: '>', value: '50' }, stateMap), false);
  });

  test('<= : 当前值等于阈值时返回 true', () => {
    const stateMap = new Map([['世界.戒严等级', '4']]);
    assert.strictEqual(evaluateCondition({ target_field: '世界.戒严等级', operator: '<=', value: '4' }, stateMap), true);
  });

  test('<= : 当前值小于阈值时返回 true', () => {
    const stateMap = new Map([['世界.戒严等级', '3']]);
    assert.strictEqual(evaluateCondition({ target_field: '世界.戒严等级', operator: '<=', value: '4' }, stateMap), true);
  });

  test('<= : 当前值大于阈值时返回 false', () => {
    const stateMap = new Map([['世界.戒严等级', '5']]);
    assert.strictEqual(evaluateCondition({ target_field: '世界.戒严等级', operator: '<=', value: '4' }, stateMap), false);
  });

  test('!= : 当前值不等于阈值时返回 true', () => {
    const stateMap = new Map([['世界.戒严等级', '3']]);
    assert.strictEqual(evaluateCondition({ target_field: '世界.戒严等级', operator: '!=', value: '5' }, stateMap), true);
  });

  test('!= : 当前值等于阈值时返回 false', () => {
    const stateMap = new Map([['世界.戒严等级', '5']]);
    assert.strictEqual(evaluateCondition({ target_field: '世界.戒严等级', operator: '!=', value: '5' }, stateMap), false);
  });

  test('< : 当前值小于阈值时返回 true', () => {
    const stateMap = new Map([['世界.戒严等级', '2']]);
    assert.strictEqual(evaluateCondition({ target_field: '世界.戒严等级', operator: '<', value: '5' }, stateMap), true);
  });

  test('>= : 当前值等于阈值时返回 true', () => {
    const stateMap = new Map([['凛.好感度', '50']]);
    assert.strictEqual(evaluateCondition({ target_field: '凛.好感度', operator: '>=', value: '50' }, stateMap), true);
  });

  test('= : 数值等于时返回 true', () => {
    const stateMap = new Map([['凛.好感度', '50']]);
    assert.strictEqual(evaluateCondition({ target_field: '凛.好感度', operator: '=', value: '50' }, stateMap), true);
  });
});

describe('evaluateCondition — 文本操作符', () => {
  test('包含 : 当前值包含子串时返回 true', () => {
    const stateMap = new Map([['玩家.状态', '严重受伤']]);
    assert.strictEqual(evaluateCondition({ target_field: '玩家.状态', operator: '包含', value: '受伤' }, stateMap), true);
  });

  test('包含 : 当前值不包含子串时返回 false', () => {
    const stateMap = new Map([['玩家.状态', '正常']]);
    assert.strictEqual(evaluateCondition({ target_field: '玩家.状态', operator: '包含', value: '受伤' }, stateMap), false);
  });

  test('等于 : 当前值完全匹配时返回 true', () => {
    const stateMap = new Map([['玩家.状态', '正常']]);
    assert.strictEqual(evaluateCondition({ target_field: '玩家.状态', operator: '等于', value: '正常' }, stateMap), true);
  });

  test('等于 : 当前值不匹配时返回 false', () => {
    const stateMap = new Map([['玩家.状态', '受伤']]);
    assert.strictEqual(evaluateCondition({ target_field: '玩家.状态', operator: '等于', value: '正常' }, stateMap), false);
  });

  test('不包含 : 当前值不包含子串时返回 true', () => {
    const stateMap = new Map([['玩家.状态', '正常']]);
    assert.strictEqual(evaluateCondition({ target_field: '玩家.状态', operator: '不包含', value: '受伤' }, stateMap), true);
  });

  test('不包含 : 当前值包含子串时返回 false', () => {
    const stateMap = new Map([['玩家.状态', '严重受伤']]);
    assert.strictEqual(evaluateCondition({ target_field: '玩家.状态', operator: '不包含', value: '受伤' }, stateMap), false);
  });
});

describe('evaluateCondition — 字段不存在', () => {
  test('字段不在 stateMap 中时返回 false', () => {
    const stateMap = new Map();
    assert.strictEqual(evaluateCondition({ target_field: '凛.好感度', operator: '>', value: '50' }, stateMap), false);
  });

  test('空 stateMap 对文本操作符也返回 false', () => {
    const stateMap = new Map();
    assert.strictEqual(evaluateCondition({ target_field: '玩家.状态', operator: '等于', value: '正常' }, stateMap), false);
  });
});
