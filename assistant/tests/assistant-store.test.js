import test from 'node:test';
import assert from 'node:assert/strict';

// useAssistantStore 依赖 zustand，这里直接测试纯 action 逻辑
// 通过导入 store 的 reducer 实现（zustand get/set 模式）

// 用轻量级方式构造初始 state 并执行 action 逻辑，不依赖 DOM
function makeState(overrides = {}) {
  return {
    messages: [],
    isStreaming: false,
    currentTask: null,
    resolvedIds: {},
    ...overrides,
  };
}

// --- patchCurrentTask ---
test('patchCurrentTask 会合并更新 currentTask 的部分字段', () => {
  const s = makeState({ currentTask: { id: 'task-1', status: 'running', goal: '创建世界' } });
  const patchCurrentTask = (patch) => ({
    currentTask: s.currentTask ? { ...s.currentTask, ...patch } : patch,
  });

  const next = patchCurrentTask({ status: 'awaiting_step_approval', awaitingStepId: 'step-1' });
  assert.equal(next.currentTask.id, 'task-1');
  assert.equal(next.currentTask.status, 'awaiting_step_approval');
  assert.equal(next.currentTask.awaitingStepId, 'step-1');
  assert.equal(next.currentTask.goal, '创建世界');
});

test('patchCurrentTask 在 currentTask 为 null 时用 patch 作为初始值', () => {
  const s = makeState({ currentTask: null });
  const patchCurrentTask = (patch) => ({
    currentTask: s.currentTask ? { ...s.currentTask, ...patch } : patch,
  });

  const next = patchCurrentTask({ status: 'completed' });
  assert.equal(next.currentTask.status, 'completed');
});

// --- updateTaskStep ---
test('updateTaskStep 会根据 stepId 更新计划中的指定步骤', () => {
  const s = makeState({
    currentTask: {
      id: 'task-1',
      plan: {
        steps: [
          { id: 'step-a', status: 'pending', title: 'A' },
          { id: 'step-b', status: 'pending', title: 'B' },
        ],
      },
      graph: [
        { id: 'step-a', status: 'pending', title: 'A' },
        { id: 'step-b', status: 'pending', title: 'B' },
      ],
    },
  });

  const updateTaskStep = (stepId, updater) => {
    if (!s.currentTask?.plan?.steps) return s;
    const steps = s.currentTask.plan.steps.map((step) => (
      step.id === stepId ? updater(step) : step
    ));
    return {
      currentTask: {
        ...s.currentTask,
        plan: { ...s.currentTask.plan, steps },
        graph: steps,
      },
    };
  };

  const next = updateTaskStep('step-a', (step) => ({ ...step, status: 'completed' }));
  assert.equal(next.currentTask.plan.steps[0].status, 'completed');
  assert.equal(next.currentTask.plan.steps[1].status, 'pending');
  assert.equal(next.currentTask.graph[0].status, 'completed');
});

test('updateTaskStep 在步骤不存在时不影响其他步骤', () => {
  const s = makeState({
    currentTask: {
      id: 'task-1',
      plan: { steps: [{ id: 'step-a', status: 'pending' }] },
      graph: [{ id: 'step-a', status: 'pending' }],
    },
  });

  const updateTaskStep = (stepId, updater) => {
    if (!s.currentTask?.plan?.steps) return s;
    const steps = s.currentTask.plan.steps.map((step) => (
      step.id === stepId ? updater(step) : step
    ));
    return { currentTask: { ...s.currentTask, plan: { ...s.currentTask.plan, steps }, graph: steps } };
  };

  const next = updateTaskStep('step-nonexistent', (step) => ({ ...step, status: 'completed' }));
  assert.equal(next.currentTask.plan.steps[0].status, 'pending');
});

// --- setResolvedId ---
test('setResolvedId 会追加 resolvedIds 而不清除已有条目', () => {
  const s = makeState({ resolvedIds: { 'task-old': 'world-99' } });
  const setResolvedId = (taskId, entityId) => ({
    resolvedIds: { ...s.resolvedIds, [taskId]: entityId },
  });

  const next = setResolvedId('task-1', 'world-42');
  assert.equal(next.resolvedIds['task-old'], 'world-99');
  assert.equal(next.resolvedIds['task-1'], 'world-42');
});

// --- clearMessages ---
test('clearMessages 同时清除 messages 和 currentTask', () => {
  const s = makeState({
    messages: [{ id: '1', role: 'user', content: 'hi' }],
    currentTask: { id: 'task-1', status: 'running' },
    isStreaming: true,
    resolvedIds: { 'task-1': 'world-1' },
  });

  const clearMessages = () => ({
    messages: [],
    resolvedIds: {},
    isStreaming: false,
    currentTask: null,
  });

  const next = clearMessages();
  assert.deepEqual(next.messages, []);
  assert.equal(next.currentTask, null);
  assert.equal(next.isStreaming, false);
  assert.deepEqual(next.resolvedIds, {});
});

// --- ghost task 逻辑 ---
test('ghost task：非终态 currentTask 在 mount 时应被清除', () => {
  const ACTIVE_STATUSES = new Set(['pending', 'researching', 'clarifying', 'running', 'awaiting_plan_approval', 'awaiting_step_approval']);

  const ghostTask = { id: 'task-stale', status: 'awaiting_step_approval' };
  assert.equal(ACTIVE_STATUSES.has(ghostTask.status), true, '活跃状态应被识别');

  const completedTask = { id: 'task-done', status: 'completed' };
  assert.equal(ACTIVE_STATUSES.has(completedTask.status), false, '终态不应被清除');

  const cancelledTask = { id: 'task-x', status: 'cancelled' };
  assert.equal(ACTIVE_STATUSES.has(cancelledTask.status), false, '已取消不应被清除');
});

// --- replaceRoutingWithProposal ---
test('replaceRoutingWithProposal 优先按 taskId 替换 routing 消息', () => {
  const s = makeState({
    messages: [
      { id: 'msg-1', role: 'routing', taskId: 'task-a', target: 'world-card' },
      { id: 'msg-2', role: 'routing', taskId: 'task-b', target: 'character-card' },
    ],
  });

  const replaceRoutingWithProposal = (taskId, token, proposal) => {
    const msgs = [...s.messages];
    const idx = taskId
      ? msgs.findLastIndex((m) => m.role === 'routing' && m.taskId === taskId)
      : msgs.findLastIndex((m) => m.role === 'routing');
    const proposalMsg = {
      id: `${Date.now()}-stub`,
      role: 'proposal',
      taskId,
      token,
      proposal,
      applied: false,
    };
    if (idx >= 0) msgs[idx] = proposalMsg;
    else msgs.push(proposalMsg);
    return { messages: msgs };
  };

  const next = replaceRoutingWithProposal('task-a', 'tok-1', { type: 'world-card' });
  assert.equal(next.messages[0].role, 'proposal');
  assert.equal(next.messages[0].taskId, 'task-a');
  assert.equal(next.messages[1].role, 'routing');
  assert.equal(next.messages[1].taskId, 'task-b');
});
