import test from 'node:test';
import assert from 'node:assert/strict';
import { SSE_EVENTS } from '../server/sse-events.js';

test('SSE_EVENTS 导出所有写卡助手用到的事件类型', () => {
  const expected = [
    'TASK_CREATED', 'TASK_SNAPSHOT', 'TASK_COMPLETED', 'TASK_FAILED', 'TASK_CANCELLED',
    'PLAN_DOC_UPDATED', 'PLAN_APPROVED',
    'AWAITING_APPROVAL', 'PAUSED',
    'STEP_STARTED', 'STEP_COMPLETED', 'STEP_FAILED',
    'TOOL_CALL_STARTED', 'TOOL_CALL_COMPLETED',
    'DELTA', 'DONE',
    'MESSAGES_CHANGED', 'USER_MESSAGE',
  ];
  for (const key of expected) {
    assert.ok(SSE_EVENTS[key], `应导出 ${key}`);
    assert.equal(typeof SSE_EVENTS[key], 'string', `${key} 应为字符串`);
    assert.match(SSE_EVENTS[key], /^[a-z][a-z_]+$/, `${key}=${SSE_EVENTS[key]} 应为 snake_case`);
  }
});

test('SSE_EVENTS 不允许出现重复的 value', () => {
  const values = Object.values(SSE_EVENTS);
  assert.equal(values.length, new Set(values).size, '重复 value 会污染 type 命名空间');
});
