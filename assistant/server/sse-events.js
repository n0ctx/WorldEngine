/**
 * 写卡助手 SSE 事件类型常量
 *
 * 集中所有 SSE event.type 字面量，前后端共享 import。
 * - key 大写下划线（程序常量风格）
 * - value snake_case（线协议风格，沿用历史）
 *
 * 使用：
 *   import { SSE_EVENTS } from './sse-events.js';
 *   emitFn({ type: SSE_EVENTS.STEP_STARTED, ... });
 *
 * 新增事件时：同步追加 tests/sse-events.test.js 的期望列表。
 */

export const SSE_EVENTS = Object.freeze({
  // 任务生命周期
  TASK_CREATED: 'task_created',
  TASK_COMPLETED: 'task_completed',
  TASK_FAILED: 'task_failed',
  TASK_CANCELLED: 'task_cancelled',

  // 计划文档与审批
  PLAN_DOC_UPDATED: 'plan_doc_updated',
  PLAN_APPROVED: 'plan_approved',
  AWAITING_APPROVAL: 'awaiting_approval',
  PAUSED: 'paused',

  // 子代理步骤
  STEP_STARTED: 'step_started',
  STEP_COMPLETED: 'step_completed',
  STEP_FAILED: 'step_failed',

  // 工具调用
  TOOL_CALL_STARTED: 'tool_call_started',
  TOOL_CALL_COMPLETED: 'tool_call_completed',

  // LLM 流式
  DELTA: 'delta',
  DONE: 'done',

  // 消息状态
  MESSAGES_CHANGED: 'messages_changed',
  USER_MESSAGE: 'user_message',
});
