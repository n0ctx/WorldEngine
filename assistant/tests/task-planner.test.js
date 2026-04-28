import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport, resetMockEnv } from '../../backend/tests/helpers/test-env.js';

const sandbox = createTestSandbox('assistant-task-planner');
sandbox.setEnv();

after(() => {
  resetMockEnv();
  sandbox.cleanup();
});

test('validatePlanSteps 会拒绝缺失 world 依赖和高风险漏标记', async () => {
  const { __testables } = await importPlanner();
  const errors = __testables.validatePlanSteps([
    {
      id: 'step-create-char',
      title: '创建角色',
      targetType: 'character-card',
      operation: 'create',
      entityRef: null,
      dependsOn: [],
      task: '创建主角',
      riskLevel: 'low',
    },
    {
      id: 'step-delete-world',
      title: '删除世界',
      targetType: 'world-card',
      operation: 'delete',
      entityRef: 'context.worldId',
      dependsOn: [],
      task: '删除当前世界',
      riskLevel: 'medium',
    },
  ], {});

  assert.ok(errors.some((item) => item.includes('character-card create 缺少世界来源') || item.includes('character-card create 缺少 entityRef')));
  assert.ok(errors.some((item) => item.includes('riskLevel 必须为 high')));
});

test('buildPlannerPrompt 会要求 CUD 计划统一使用占位符术语', async () => {
  const { __testables } = await importPlanner();
  const messages = __testables.buildPlannerPrompt({
    message: '创建一个世界和角色',
    history: [],
    context: {},
  });

  assert.match(messages[0].content, /代入者统一写 \{\{user\}\}/);
  assert.match(messages[0].content, /角色统一写 \{\{char\}\}/);
  assert.match(messages[0].content, /不要混写“用户”“玩家”“AI”“NPC”/);
  assert.match(messages[1].content, /原始需求：创建一个世界和角色/);
});

test('buildPlannerPrompt 会要求复杂世界卡分类拆步和状态机模板', async () => {
  const { __testables } = await importPlanner();
  const messages = __testables.buildPlannerPrompt({
    message: '创建一个无限轮回任务结算世界卡，包含任务阶段和玩家属性',
    history: [],
    context: {},
  });

  assert.match(messages[0].content, /先在内部判断任务类型/);
  assert.match(messages[0].content, /复杂世界卡或状态机世界卡必须优先拆步/);
  assert.match(messages[0].content, /状态机世界卡的推荐模板/);
  assert.match(messages[0].content, /conditions 全部引用同一个阶段字段/);
  assert.match(messages[0].content, /修复已有卡的推荐模板/);
});

test('planTask 在语义校验失败后会执行 semantic retry', async () => {
  const { planTask } = await importPlanner();
  resetMockEnv();
  process.env.MOCK_LLM_COMPLETE_QUEUE = JSON.stringify([
    JSON.stringify({
      mode: 'plan',
      summary: '第一次输出不合法',
      steps: [
        {
          id: 'step-create-char',
          title: '创建角色',
          targetType: 'character-card',
          operation: 'create',
          entityRef: null,
          dependsOn: [],
          task: '创建一个主角',
          riskLevel: 'low',
        },
      ],
    }),
    JSON.stringify({
      mode: 'plan',
      summary: '修正后的计划',
      steps: [
        {
          id: 'step-create-world',
          title: '创建世界卡',
          targetType: 'world-card',
          operation: 'create',
          entityRef: null,
          dependsOn: [],
          task: '创建世界骨架',
          riskLevel: 'low',
        },
        {
          id: 'step-create-char',
          title: '创建角色',
          targetType: 'character-card',
          operation: 'create',
          entityRef: 'step:step-create-world',
          dependsOn: ['step-create-world'],
          task: '在刚创建的世界中创建主角',
          riskLevel: 'low',
        },
      ],
    }),
  ]);

  const planned = await planTask({
    message: '创建一个世界并添加主角',
    history: [],
    context: {},
  });

  assert.equal(planned.kind, 'plan');
  assert.ok(planned.steps.length >= 2);
  const characterCreateStep = planned.steps.find((step) => step.targetType === 'character-card' && step.operation === 'create');
  assert.ok(characterCreateStep);
  assert.match(characterCreateStep.entityRef, /^step:/);
});

async function importPlanner() {
  return freshImport('assistant/server/task-planner.js');
}
