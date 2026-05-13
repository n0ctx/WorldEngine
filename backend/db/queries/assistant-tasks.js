import db from '../index.js';

function parseJson(raw, fallback) {
  if (typeof raw !== 'string' || raw.length === 0) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function encodeJson(value, fallback) {
  return JSON.stringify(value ?? fallback);
}

function decodeRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    context: parseJson(row.context_json, {}),
    messages: parseJson(row.messages_json, []),
    pendingUserMessages: parseJson(row.pending_user_messages_json, []),
    planDocContent: typeof row.plan_doc_content === 'string' ? row.plan_doc_content : '',
    modelContext: parseJson(row.model_context_json, null),
    createdAt: row.created_at,
    currentStepId: row.current_step_id ?? null,
    lastToolFailure: parseJson(row.last_tool_failure_json, null),
    lastSubagentResult: parseJson(row.last_subagent_result_json, null),
    approvalCheckpoint: parseJson(row.approval_checkpoint_json, null),
    loopIteration: Number.isFinite(row.loop_iteration) ? row.loop_iteration : 0,
    error: typeof row.error === 'string' ? row.error : undefined,
    updatedAt: row.updated_at,
  };
}

export function upsertAssistantTask(task) {
  db.prepare(`
    INSERT INTO assistant_tasks (
      id, status, context_json, messages_json, pending_user_messages_json, plan_doc_content,
      model_context_json, created_at, current_step_id, last_tool_failure_json,
      last_subagent_result_json, approval_checkpoint_json, loop_iteration, error, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status,
      context_json = excluded.context_json,
      messages_json = excluded.messages_json,
      pending_user_messages_json = excluded.pending_user_messages_json,
      plan_doc_content = excluded.plan_doc_content,
      model_context_json = excluded.model_context_json,
      created_at = excluded.created_at,
      current_step_id = excluded.current_step_id,
      last_tool_failure_json = excluded.last_tool_failure_json,
      last_subagent_result_json = excluded.last_subagent_result_json,
      approval_checkpoint_json = excluded.approval_checkpoint_json,
      loop_iteration = excluded.loop_iteration,
      error = excluded.error,
      updated_at = excluded.updated_at
  `).run(
    task.id,
    task.status,
    encodeJson(task.context, {}),
    encodeJson(task.messages, []),
    encodeJson(task.pendingUserMessages, []),
    typeof task.planDocContent === 'string' ? task.planDocContent : '',
    task.modelContext == null ? null : encodeJson(task.modelContext, null),
    task.createdAt,
    task.currentStepId ?? null,
    task.lastToolFailure == null ? null : encodeJson(task.lastToolFailure, null),
    task.lastSubagentResult == null ? null : encodeJson(task.lastSubagentResult, null),
    task.approvalCheckpoint == null ? null : encodeJson(task.approvalCheckpoint, null),
    Number.isFinite(task.loopIteration) ? task.loopIteration : 0,
    task.error ?? null,
    task.updatedAt,
  );
}

export function deleteAssistantTask(id) {
  db.prepare('DELETE FROM assistant_tasks WHERE id = ?').run(id);
}

export function getAssistantTask(id) {
  return decodeRow(db.prepare('SELECT * FROM assistant_tasks WHERE id = ?').get(id));
}

export function listAssistantTasks() {
  return db.prepare('SELECT * FROM assistant_tasks ORDER BY created_at ASC').all().map(decodeRow);
}

export function getLatestAssistantTask(whereSql = '1 = 1') {
  return decodeRow(
    db.prepare(`SELECT * FROM assistant_tasks WHERE ${whereSql} ORDER BY updated_at DESC LIMIT 1`).get(),
  );
}
