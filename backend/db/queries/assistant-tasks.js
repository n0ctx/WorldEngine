import db from '../index.js';
import { encodeJson, parseJson } from './_json.js';

function decodeRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    context: parseJson(row.context_json, {}),
    messages: parseJson(row.messages_json, []),
    pendingUserMessages: parseJson(row.pending_user_messages_json, []),
    modelContext: parseJson(row.model_context_json, null),
    createdAt: row.created_at,
    error: typeof row.error === 'string' ? row.error : undefined,
    updatedAt: row.updated_at,
  };
}

export function upsertAssistantTask(task) {
  db.prepare(`
    INSERT INTO assistant_tasks (
      id, status, context_json, messages_json, pending_user_messages_json,
      model_context_json, created_at, error, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status,
      context_json = excluded.context_json,
      messages_json = excluded.messages_json,
      pending_user_messages_json = excluded.pending_user_messages_json,
      model_context_json = excluded.model_context_json,
      created_at = excluded.created_at,
      error = excluded.error,
      updated_at = excluded.updated_at
  `).run(
    task.id,
    task.status,
    encodeJson(task.context, {}),
    encodeJson(task.messages, []),
    encodeJson(task.pendingUserMessages, []),
    task.modelContext == null ? null : encodeJson(task.modelContext, null),
    task.createdAt,
    task.error ?? null,
    task.updatedAt,
  );
}

export function deleteAssistantTask(id) {
  db.prepare('DELETE FROM assistant_tasks WHERE id = ?').run(id);
}

export function listAssistantTasks() {
  return db.prepare('SELECT * FROM assistant_tasks ORDER BY created_at ASC').all().map(decodeRow);
}

export function getLatestAssistantTask(whereSql = '1 = 1', params = []) {
  return decodeRow(
    db.prepare(`SELECT * FROM assistant_tasks WHERE ${whereSql} ORDER BY updated_at DESC LIMIT 1`).get(...params),
  );
}
