import test from 'node:test';
import assert from 'node:assert/strict';

import { __testables } from '../client/useAssistantStore.js';

test('sanitizeMessagesForPersist 保留工具、步骤、计划记录并清理运行态', () => {
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
  assert.deepEqual(got.map((m) => m.role), ['user', 'assistant', 'tool_call', 'tool_call', 'step', 'plan_doc']);
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
