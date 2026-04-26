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
