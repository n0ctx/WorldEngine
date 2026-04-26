/**
 * 写卡助手前端 API 封装
 */

const BASE = '/api/assistant';

function processSseBlock(block, callbacks) {
  const line = block.split('\n').find((item) => item.startsWith('data: '));
  if (!line) return;
  const json = line.slice(6).trim();
  if (!json) return;
  try {
    const evt = JSON.parse(json);
    if (evt.delta !== undefined) {
      callbacks.onDelta?.(evt.delta);
    } else if (evt.done) {
      callbacks.onDone?.();
    } else if (evt.type === 'routing') {
      callbacks.onRouting?.(evt);
    } else if (evt.type === 'proposal') {
      callbacks.onProposal?.(evt.taskId, evt.token, evt.proposal);
    } else if (evt.type === 'error') {
      callbacks.onError?.(evt.error);
    } else if (evt.type === 'thinking') {
      callbacks.onThinking?.(evt.taskId);
    } else if (evt.type === 'tool_call') {
      callbacks.onToolCall?.(evt.name);
    } else if (evt.type === 'task_created') {
      callbacks.onTaskCreated?.(evt.task);
    } else if (evt.type === 'clarification_requested') {
      callbacks.onClarificationRequested?.(evt.task, evt.questions, evt.summary);
    } else if (evt.type === 'clarification_answered') {
      callbacks.onClarificationAnswered?.(evt.task, evt.answer);
    } else if (evt.type === 'plan_ready') {
      callbacks.onPlanReady?.(evt.task, evt.plan, evt.riskFlags);
    } else if (evt.type === 'plan_approved') {
      callbacks.onPlanApproved?.(evt.task);
    } else if (evt.type === 'step_started') {
      callbacks.onStepStarted?.(evt.taskId, evt.stepId, evt.step);
    } else if (evt.type === 'step_proposal_ready') {
      callbacks.onStepProposalReady?.(evt.taskId, evt.stepId, evt.proposal, evt.proposalSummary, evt.step);
    } else if (evt.type === 'step_approval_requested') {
      callbacks.onStepApprovalRequested?.(evt.taskId, evt.stepId, evt.step);
    } else if (evt.type === 'step_approved') {
      callbacks.onStepApproved?.(evt.task);
    } else if (evt.type === 'step_completed') {
      callbacks.onStepCompleted?.(evt.taskId, evt.stepId, evt.result, evt.step);
    } else if (evt.type === 'step_failed') {
      callbacks.onStepFailed?.(evt.taskId, evt.stepId, evt.error, evt.step);
    } else if (evt.type === 'task_completed') {
      callbacks.onTaskCompleted?.(evt.taskId);
    } else if (evt.type === 'task_failed') {
      callbacks.onTaskFailed?.(evt.taskId, evt.error, evt.task);
    }
  } catch {
    // ignore malformed events
  }
}

function streamAssistantRequest(url, payload, callbacks) {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        callbacks.onError?.(err.error || `HTTP ${res.status}`);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          processSseBlock(line, callbacks);
        }
      }

      if (buffer.trim()) {
        processSseBlock(buffer.trim(), callbacks);
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        callbacks.onError?.(err.message);
      }
    } finally {
      callbacks.onStreamEnd?.();
    }
  })();

  return () => controller.abort();
}

/**
 * 发起助手对话（SSE 流式）
 * @param {object} payload  { message, history, context }
 * @param {object} callbacks { onDelta, onRouting, onProposal, onDone, onError, onStreamEnd }
 * @returns {Function} abort 函数
 */
export function chatAssistant(payload, callbacks) {
  return streamAssistantRequest(`${BASE}/chat`, payload, callbacks);
}

export function startAssistantTask(payload, callbacks) {
  return streamAssistantRequest(`${BASE}/tasks`, payload, callbacks);
}

export function answerAssistantTask(taskId, answer, callbacks) {
  return streamAssistantRequest(`${BASE}/tasks/${taskId}/answer`, { answer }, callbacks);
}

export function approveAssistantTaskPlan(taskId, callbacks) {
  return streamAssistantRequest(`${BASE}/tasks/${taskId}/approve-plan`, {}, callbacks);
}

export function approveAssistantTaskStep(taskId, stepId, editedProposal, callbacks) {
  const body = { stepId };
  if (editedProposal) body.editedProposal = editedProposal;
  return streamAssistantRequest(`${BASE}/tasks/${taskId}/approve-step`, body, callbacks);
}

export async function getAssistantTask(taskId) {
  const res = await fetch(`${BASE}/tasks/${taskId}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function cancelAssistantTask(taskId) {
  const res = await fetch(`${BASE}/tasks/${taskId}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * 应用子代理提案（凭服务端签发的 token 执行）
 * @param {string} token              服务端签发的一次性 token
 * @param {string} [worldRefId]       依赖世界卡 create 时由前端传入的 worldId
 * @param {object} [editedProposal]   用户编辑后的提案内容（可选），服务端以 token 锚定 type/operation/entityId
 * @returns {Promise<object>}
 */
export async function executeProposal(token, worldRefId, editedProposal) {
  const body = { token };
  if (worldRefId) body.worldRefId = worldRefId;
  if (editedProposal) body.editedProposal = editedProposal;
  const res = await fetch(`${BASE}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const __testables = {
  processSseBlock,
  streamAssistantRequest,
};
