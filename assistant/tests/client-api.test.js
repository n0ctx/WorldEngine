import test from 'node:test';
import assert from 'node:assert/strict';

import { chatAssistant, startAssistantTask, approveAssistantTaskStep, __testables } from '../client/api.js';

test('processSseBlock 会解析 assistant SSE 事件', () => {
  const calls = [];
  __testables.processSseBlock('data: {"type":"tool_call","name":"preview_card"}', {
    onToolCall(name) {
      calls.push(['tool_call', name]);
    },
  });

  assert.deepEqual(calls, [['tool_call', 'preview_card']]);
});

test('processSseBlock 会解析 task 计划事件', () => {
  const calls = [];
  __testables.processSseBlock('data: {"type":"plan_ready","task":{"id":"task-1","status":"awaiting_plan_approval"},"plan":{"steps":[]},"riskFlags":[]}', {
    onPlanReady(task, plan, riskFlags) {
      calls.push([task.id, task.status, Array.isArray(plan.steps), riskFlags.length]);
    },
  });

  assert.deepEqual(calls, [['task-1', 'awaiting_plan_approval', true, 0]]);
});

test('processSseBlock 会把完整高风险步骤 proposal 透传给回调', () => {
  const calls = [];
  __testables.processSseBlock('data: {"type":"step_proposal_ready","taskId":"task-1","stepId":"step-risk","proposal":{"type":"world-card","operation":"delete","entityId":"world-1","changes":{},"explanation":"删除世界"},"proposalSummary":{"type":"world-card"},"step":{"id":"step-risk"}}', {
    onStepProposalReady(taskId, stepId, proposal, proposalSummary, step) {
      calls.push([taskId, stepId, proposal.type, proposal.operation, proposalSummary.type, step.id]);
    },
  });

  assert.deepEqual(calls, [['task-1', 'step-risk', 'world-card', 'delete', 'world-card', 'step-risk']]);
});

test('chatAssistant 会在流结束时处理 buffer 中残留的最后一个 SSE 事件', async () => {
  const encoder = new TextEncoder();
  const chunks = [
    'data: {"delta":"你"}\n',
    'data: {"done":true}',
  ];

  global.fetch = async () => ({
    ok: true,
    body: new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    }),
  });

  const deltas = [];
  let done = 0;
  let streamEnd = 0;

  await new Promise((resolve) => {
    chatAssistant({ message: 'hi' }, {
      onDelta(delta) {
        deltas.push(delta);
      },
      onDone() {
        done += 1;
      },
      onStreamEnd() {
        streamEnd += 1;
        resolve();
      },
    });
  });

  assert.deepEqual(deltas, ['你']);
  assert.equal(done, 1);
  assert.equal(streamEnd, 1);
});

test('startAssistantTask 会透传 task 事件并在结束时触发 onStreamEnd', async () => {
  const encoder = new TextEncoder();
  const chunks = [
    'data: {"type":"task_created","task":{"id":"task-1","status":"researching"}}\n',
    'data: {"type":"plan_ready","task":{"id":"task-1","status":"awaiting_plan_approval","plan":{"steps":[]}},"plan":{"steps":[]},"riskFlags":[]}\n',
    'data: {"done":true}',
  ];

  global.fetch = async () => ({
    ok: true,
    body: new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    }),
  });

  const calls = [];
  await new Promise((resolve) => {
    startAssistantTask({ message: 'hi' }, {
      onTaskCreated(task) {
        calls.push(['created', task.id, task.status]);
      },
      onPlanReady(task) {
        calls.push(['plan', task.id, task.status]);
      },
      onDone() {
        calls.push(['done']);
      },
      onStreamEnd() {
        calls.push(['end']);
        resolve();
      },
    });
  });

  assert.deepEqual(calls, [
    ['created', 'task-1', 'researching'],
    ['plan', 'task-1', 'awaiting_plan_approval'],
    ['done'],
    ['end'],
  ]);
});

test('processSseBlock 会正确解析步骤完整生命周期事件序列', () => {
  const events = [
    `data: {"type":"step_started","taskId":"task-1","stepId":"step-a","step":{"id":"step-a","status":"running"}}`,
    `data: {"type":"step_approval_requested","taskId":"task-1","stepId":"step-a","step":{"id":"step-a","status":"awaiting_approval"}}`,
    `data: {"type":"step_approved","task":{"id":"task-1","status":"running"}}`,
    `data: {"type":"step_completed","taskId":"task-1","stepId":"step-a","result":{"id":"world-99"},"step":{"id":"step-a","status":"completed"}}`,
    `data: {"type":"task_completed","taskId":"task-1"}`,
  ];

  const calls = [];
  for (const block of events) {
    __testables.processSseBlock(block, {
      onStepStarted(taskId, stepId, step) { calls.push(['started', stepId, step.status]); },
      onStepApprovalRequested(taskId, stepId, step) { calls.push(['approval_req', stepId, step.status]); },
      onStepApproved(task) { calls.push(['approved', task.id, task.status]); },
      onStepCompleted(taskId, stepId, result, step) { calls.push(['completed', stepId, result.id, step.status]); },
      onTaskCompleted(taskId) { calls.push(['task_done', taskId]); },
    });
  }

  assert.deepEqual(calls, [
    ['started', 'step-a', 'running'],
    ['approval_req', 'step-a', 'awaiting_approval'],
    ['approved', 'task-1', 'running'],
    ['completed', 'step-a', 'world-99', 'completed'],
    ['task_done', 'task-1'],
  ]);
});

test('approveAssistantTaskStep 携带 editedProposal 时正确发送请求体', async () => {
  const encoder = new TextEncoder();
  const chunks = [
    'data: {"type":"step_approved","task":{"id":"task-1","status":"running"}}\n',
    'data: {"type":"step_completed","taskId":"task-1","stepId":"step-a","result":{"id":"world-1"},"step":{"id":"step-a","status":"completed"}}\n',
    'data: {"type":"task_completed","taskId":"task-1"}\n',
    'data: {"done":true}',
  ];

  let capturedBody;
  global.fetch = async (url, opts) => {
    capturedBody = JSON.parse(opts.body);
    return {
      ok: true,
      body: new ReadableStream({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }),
    };
  };

  const editedProposal = { changes: { name: '修改后的名称' }, entryOps: [], stateFieldOps: [] };
  const calls = [];

  await new Promise((resolve) => {
    approveAssistantTaskStep('task-1', 'step-a', editedProposal, {
      onStepCompleted(taskId, stepId, result) { calls.push(['completed', stepId, result.id]); },
      onTaskCompleted() { calls.push(['task_done']); },
      onStreamEnd() { resolve(); },
    });
  });

  assert.equal(capturedBody.stepId, 'step-a');
  assert.deepEqual(capturedBody.editedProposal, editedProposal);
  assert.deepEqual(calls, [['completed', 'step-a', 'world-1'], ['task_done']]);
});

test('approveAssistantTaskStep 不携带 editedProposal 时请求体中无该字段', async () => {
  const encoder = new TextEncoder();

  let capturedBody;
  global.fetch = async (url, opts) => {
    capturedBody = JSON.parse(opts.body);
    return {
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"done":true}'));
          controller.close();
        },
      }),
    };
  };

  await new Promise((resolve) => {
    approveAssistantTaskStep('task-1', 'step-b', undefined, {
      onStreamEnd() { resolve(); },
    });
  });

  assert.equal(capturedBody.stepId, 'step-b');
  assert.equal('editedProposal' in capturedBody, false);
});
