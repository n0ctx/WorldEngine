/**
 * 写卡助手前端 API（单 /agent 接口模型）
 *
 *   POST /api/assistant/agent             —— SSE 流式入口
 *   POST /api/assistant/agent/:id/approve —— 批准计划
 *   POST /api/assistant/agent/:id/reject  —— 拒绝当前计划，保留任务继续对话
 *   POST /api/assistant/agent/:id/cancel  —— 取消任务
 *   GET  /api/assistant/agent/recover     —— 找回最近可恢复任务
 *   GET  /api/assistant/agent/:id/stream  —— 补订阅任务 SSE
 *   GET  /api/assistant/agent/:id/plan-doc —— 拉取最新计划文档
 */

import { SSE_EVENTS } from '../server/sse-events.js';

const BASE = '/api/assistant';

/**
 * 与父代理建立 SSE 流。
 * 服务端按 `data: <json>\n\n` 帧推送事件。
 *
 * @param {object}   args
 * @param {string?}  args.taskId    续连已有任务时传入；首次发起留空
 * @param {string}   args.message   用户消息
 * @param {object?}  args.context   { worldId, characterId, world, character, config }
 * @param {(evt:object)=>void} args.onEvent 每条事件回调
 * @param {AbortSignal?} args.signal 外部 abort
 */
export async function streamAgent({ taskId, message, messageId, context, onEvent, signal }) {
  const res = await fetch(`${BASE}/agent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId, message, messageId, context }),
    signal,
  });
  await consumeSseResponse(res, onEvent);
}

export async function resumeTask({ taskId, onEvent, signal }) {
  const res = await fetch(`${BASE}/agent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId, resume: true }),
    signal,
  });
  await consumeSseResponse(res, onEvent);
}

export async function subscribeTask({ taskId, onEvent, signal }) {
  const res = await fetch(`${BASE}/agent/${taskId}/stream`, {
    method: 'GET',
    signal,
  });
  await consumeSseResponse(res, onEvent);
}

async function consumeSseResponse(res, onEvent) {
  if (!res.ok || !res.body) {
    let errMsg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      errMsg = j.error || errMsg;
    } catch {
      // ignore
    }
    onEvent({ type: SSE_EVENTS.TASK_FAILED, error: errMsg });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const frames = buf.split('\n\n');
    buf = frames.pop() ?? '';
    for (const frame of frames) {
      const line = frame.split('\n').find((l) => l.startsWith('data: '));
      if (!line) continue;
      const payload = line.slice(6).trim();
      if (!payload) continue;
      try {
        const event = JSON.parse(payload);
        onEvent(event);
        if (event?.done === true) {
          await reader.cancel().catch(() => {});
          return;
        }
      } catch {
        // 忽略畸形帧
      }
    }
  }
}

export async function fetchTask(taskId) {
  const r = await fetch(`${BASE}/agent/${taskId}`);
  if (!r.ok) {
    let errMsg = `HTTP ${r.status}`;
    try {
      const j = await r.json();
      errMsg = j.error || errMsg;
    } catch {
      // ignore
    }
    throw new Error(errMsg);
  }
  const j = await r.json();
  return j.task || null;
}

export async function recoverTask() {
  const r = await fetch(`${BASE}/agent/recover`);
  if (!r.ok) {
    let errMsg = `HTTP ${r.status}`;
    try {
      const j = await r.json();
      errMsg = j.error || errMsg;
    } catch {
      // ignore
    }
    throw new Error(errMsg);
  }
  const j = await r.json();
  return j.task || null;
}

export async function approveTask(taskId) {
  await fetch(`${BASE}/agent/${taskId}/approve`, { method: 'POST' });
}

export async function rejectPlan(taskId) {
  const r = await fetch(`${BASE}/agent/${taskId}/reject`, { method: 'POST' });
  if (!r.ok) throw new Error(`reject failed: ${r.status}`);
  const j = await r.json().catch(() => ({}));
  return j.task || null;
}

export async function cancelTask(taskId) {
  await fetch(`${BASE}/agent/${taskId}/cancel`, { method: 'POST' });
}

export async function truncateFrom(taskId, messageId) {
  const r = await fetch(`${BASE}/agent/${taskId}/truncate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messageId }),
  });
  if (!r.ok) throw new Error(`truncate failed: ${r.status}`);
  return r.json();
}

export async function deleteMessage(taskId, messageId) {
  const r = await fetch(`${BASE}/agent/${taskId}/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messageId }),
  });
  if (!r.ok) throw new Error(`delete failed: ${r.status}`);
  return r.json();
}

export async function fetchPlanDoc(taskId) {
  const r = await fetch(`${BASE}/agent/${taskId}/plan-doc`);
  if (!r.ok) return '';
  const j = await r.json().catch(() => ({}));
  return j.content || '';
}
