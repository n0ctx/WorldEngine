import test from 'node:test';
import assert from 'node:assert/strict';

import { __testables } from '../client/useAssistantStore.js';

test('sanitizeMessagesForPersist 保留工具/步骤、丢弃 plan_doc 与未知角色、清理运行态', () => {
  const messages = [
    { id: 'u1', role: 'user', content: 'hello' },
    { id: 'a1', role: 'assistant', content: '<think>x</think>\n正文', streaming: true },
    { id: 'call-1', role: 'tool_call', toolName: 'preview_card', status: 'done' },
    { id: 'call-2', role: 'tool_call', toolName: 'apply_world_card', status: 'running' },
    { id: 'step-1', role: 'step', stepId: 'step-1', title: '写入', status: 'running' },
    { id: 'plan-doc-task-1', role: 'plan_doc', content: '# plan' },
    { id: 'x', role: 'unknown', content: 'drop' },
  ];

  const got = __testables.sanitizeMessagesForPersist(messages);
  // plan_doc 已迁移到 PlanTaskHud，不再保留在 messages 中
  assert.deepEqual(got.map((m) => m.role), ['user', 'assistant', 'tool_call', 'tool_call', 'step']);
  assert.equal(got[1].streaming, undefined);
  assert.equal(got[2].status, 'done');
  assert.equal(got[3].status, 'error');
  assert.match(got[3].error, /刷新后运行状态已中断/);
  assert.equal(got[4].status, 'error');
});

test('clearStreamingFlag 清理最近的 streaming assistant 而不是只看最后一条', () => {
  const got = __testables.clearStreamingFlag([
    { id: 'a1', role: 'assistant', content: 'hello', streaming: true },
    { id: 'call-1', role: 'tool_call', toolName: 'preview_card', status: 'done' },
  ]);

  assert.equal(got[0].streaming, false);
  assert.equal(got[1].role, 'tool_call');
});

test('applyTaskSnapshot 用服务端快照整体替换任务态', () => {
  const state = {
    taskId: 'task-old',
    status: 'running',
    planDoc: '',
    messages: [{ id: 'old', role: 'assistant', content: '旧内容' }],
    error: null,
    currentStepId: null,
    taskMsgOffset: 3,
  };
  const next = __testables.applyTaskSnapshot(state, {
    id: 'task-new',
    status: 'awaiting_approval',
    planDocContent: '# plan',
    messages: [
      { id: 'u1', role: 'user', content: '你好' },
      { id: 'p1', role: 'plan_doc', content: '# plan' },
    ],
    error: 'interrupted by restart',
    currentStepId: 'step-1',
  });

  assert.equal(next.taskId, 'task-new');
  assert.equal(next.status, 'awaiting_approval');
  assert.equal(next.planDoc, '# plan');
  // plan_doc 行被 sanitizeMessagesForPersist 丢弃，只剩 user 消息
  assert.equal(next.messages.length, 1);
  assert.equal(next.messages[0].role, 'user');
  assert.equal(next.error, 'interrupted by restart');
  assert.equal(next.currentStepId, 'step-1');
  assert.equal(next.taskMsgOffset, 0);
});
