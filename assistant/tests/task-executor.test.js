import test from 'node:test';
import assert from 'node:assert/strict';

import { freshImport, resetMockEnv } from '../../backend/tests/helpers/test-env.js';

test('executeTaskSteps 会并发执行无依赖步骤并等待依赖步骤', async () => {
  const { executeTaskSteps } = await freshImport('assistant/server/task-executor.js');
  resetMockEnv();
  const events = [];
  const task = {
    id: 'task-dag',
    status: 'executing',
    context: {},
    artifacts: {},
    graph: [
      { id: 'step-a', title: 'A', targetType: 'world-card', operation: 'create', dependsOn: [], task: '创建 A', riskLevel: 'low', approvalPolicy: 'plan_only', status: 'pending' },
      { id: 'step-b', title: 'B', targetType: 'world-card', operation: 'create', dependsOn: [], task: '创建 B', riskLevel: 'low', approvalPolicy: 'plan_only', status: 'pending' },
      { id: 'step-c', title: 'C', targetType: 'character-card', operation: 'create', entityRef: 'step:step-a', dependsOn: ['step-a'], task: '创建 C', riskLevel: 'low', approvalPolicy: 'plan_only', status: 'pending' },
    ],
  };

  await executeTaskSteps({
    task,
    normalizeProposal: (raw, locked) => ({ ...raw, type: locked.type, operation: locked.operation, entityId: locked.entityId }),
    applyProposal: async (proposal, entityId) => ({ id: entityId || `${proposal.type}-${proposal.operation}-${Math.random()}` }),
    emit: (event) => events.push(event),
    runAgent: async (_agent, { operation, entityId }) => ({
      operation,
      entityId,
      changes: { name: '测试实体' },
      entryOps: [],
      stateFieldOps: [],
      explanation: '创建测试实体',
    }),
  });

  assert.equal(task.status, 'completed');
  const startOrder = events.filter((event) => event.type === 'step_started').map((event) => event.stepId);
  assert.deepEqual(startOrder.slice(0, 2).sort(), ['step-a', 'step-b']);
  assert.equal(startOrder[2], 'step-c');
  assert.ok(task.artifacts['step-a'].entityId);
});
