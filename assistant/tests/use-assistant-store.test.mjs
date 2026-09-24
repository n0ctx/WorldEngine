import test from 'node:test';
import assert from 'node:assert/strict';

import { __testables } from '../client/useAssistantStore.js';

test('sanitizeMessagesForPersist 保留对话与工具记录、丢弃旧版计划/步骤行、清理运行态', () => {
  const messages = [
    { id: 'u1', role: 'user', content: 'hello' },
    { id: 'a1', role: 'assistant', content: '<think>x</think>\n正文', streaming: true },
    { id: 'call-1', role: 'tool_call', toolName: 'read', summary: 'world', status: 'done' },
    { id: 'call-2', role: 'tool_call', toolName: 'create', summary: 'entry 王都', status: 'running' },
    { id: 'step-1', role: 'step', stepId: 'step-1', title: '写入', status: 'running' },
    { id: 'plan-doc-task-1', role: 'plan_doc', content: '# plan' },
    { id: 'x', role: 'unknown', content: 'drop' },
  ];

  const got = __testables.sanitizeMessagesForPersist(messages);
  assert.deepEqual(got.map((m) => m.role), ['user', 'assistant', 'tool_call', 'tool_call']);
  assert.equal(got[1].streaming, undefined);
  assert.equal(got[2].status, 'done');
  assert.equal(got[3].status, 'error');
  assert.match(got[3].error, /刷新后运行状态已中断/);
});

test('clearStreamingFlag 清理最近的 streaming assistant 而不是只看最后一条', () => {
  const got = __testables.clearStreamingFlag([
    { id: 'a1', role: 'assistant', content: 'hello', streaming: true },
    { id: 'call-1', role: 'tool_call', toolName: 'read', status: 'done' },
  ]);

  assert.equal(got[0].streaming, false);
  assert.equal(got[1].role, 'tool_call');
});

test('applyTaskSnapshot 用服务端快照整体替换任务态', () => {
  const state = {
    taskId: 'task-old',
    status: 'running',
    messages: [{ id: 'old', role: 'assistant', content: '旧内容' }],
    error: null,
  };
  const next = __testables.applyTaskSnapshot(state, {
    id: 'task-new',
    status: 'failed',
    messages: [
      { id: 'u1', role: 'user', content: '你好' },
      { id: 'c1', role: 'tool_call', toolName: 'update', summary: 'entry:e1', status: 'error', error: '条目不存在' },
    ],
    error: 'interrupted by restart',
  });

  assert.equal(next.taskId, 'task-new');
  assert.equal(next.status, 'failed');
  assert.deepEqual(next.messages.map((m) => m.role), ['user', 'tool_call']);
  assert.equal(next.messages[1].error, '条目不存在');
  assert.equal(next.error, 'interrupted by restart');
});
