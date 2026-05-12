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
    sessionId: row.session_id,
    mode: row.mode,
    status: row.status,
    messages: parseJson(row.messages_json, []),
    streamingText: typeof row.streaming_text === 'string' ? row.streaming_text : '',
    continuingMessageId: row.continuing_message_id ?? null,
    continuingText: typeof row.continuing_text === 'string' ? row.continuing_text : '',
    options: parseJson(row.options_json, []),
    activatedEntries: parseJson(row.activated_entries_json, []),
    error: typeof row.error === 'string' ? row.error : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function upsertSessionStreamTask(task) {
  db.prepare(`
    INSERT INTO session_stream_tasks (
      id, session_id, mode, status, messages_json, streaming_text,
      continuing_message_id, continuing_text, options_json,
      activated_entries_json, error, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(session_id) DO UPDATE SET
      id = excluded.id,
      mode = excluded.mode,
      status = excluded.status,
      messages_json = excluded.messages_json,
      streaming_text = excluded.streaming_text,
      continuing_message_id = excluded.continuing_message_id,
      continuing_text = excluded.continuing_text,
      options_json = excluded.options_json,
      activated_entries_json = excluded.activated_entries_json,
      error = excluded.error,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at
  `).run(
    task.id,
    task.sessionId,
    task.mode,
    task.status,
    encodeJson(task.messages, []),
    typeof task.streamingText === 'string' ? task.streamingText : '',
    task.continuingMessageId ?? null,
    typeof task.continuingText === 'string' ? task.continuingText : '',
    encodeJson(task.options, []),
    encodeJson(task.activatedEntries, []),
    task.error ?? null,
    task.createdAt,
    task.updatedAt,
  );
}

export function updateSessionStreamProgress(sessionId, { streamingText, continuingText, updatedAt }) {
  db.prepare(`
    UPDATE session_stream_tasks
    SET streaming_text = ?, continuing_text = ?, updated_at = ?
    WHERE session_id = ?
  `).run(
    typeof streamingText === 'string' ? streamingText : '',
    typeof continuingText === 'string' ? continuingText : '',
    updatedAt,
    sessionId,
  );
}

export function getSessionStreamTask(sessionId) {
  return decodeRow(db.prepare('SELECT * FROM session_stream_tasks WHERE session_id = ?').get(sessionId));
}

export function listSessionStreamTasks() {
  return db.prepare('SELECT * FROM session_stream_tasks ORDER BY updated_at DESC').all().map(decodeRow);
}

export function deleteSessionStreamTask(sessionId) {
  db.prepare('DELETE FROM session_stream_tasks WHERE session_id = ?').run(sessionId);
}
