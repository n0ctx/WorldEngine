import crypto from 'node:crypto';

function nowTs(ts) {
  return ts ?? Date.now();
}

export function insertWorld(db, patch = {}) {
  const id = patch.id ?? crypto.randomUUID();
  const now = nowTs(patch.created_at);
  db.prepare(`
    INSERT INTO worlds (id, name, system_prompt, post_prompt, temperature, max_tokens, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    patch.name ?? '测试世界',
    patch.system_prompt ?? '',
    patch.post_prompt ?? '',
    patch.temperature ?? null,
    patch.max_tokens ?? null,
    now,
    patch.updated_at ?? now,
  );
  return { id, ...patch, created_at: now, updated_at: patch.updated_at ?? now };
}

export function insertPersona(db, worldId, patch = {}) {
  const id = patch.id ?? crypto.randomUUID();
  const now = nowTs(patch.created_at);
  db.prepare(`
    INSERT INTO personas (id, world_id, name, system_prompt, avatar_path, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    worldId,
    patch.name ?? '',
    patch.system_prompt ?? '',
    patch.avatar_path ?? null,
    now,
    patch.updated_at ?? now,
  );
  return { id, world_id: worldId, ...patch, created_at: now, updated_at: patch.updated_at ?? now };
}

export function insertCharacter(db, worldId, patch = {}) {
  const id = patch.id ?? crypto.randomUUID();
  const now = nowTs(patch.created_at);
  db.prepare(`
    INSERT INTO characters (id, world_id, name, system_prompt, post_prompt, first_message, avatar_path, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    worldId,
    patch.name ?? '测试角色',
    patch.system_prompt ?? '',
    patch.post_prompt ?? '',
    patch.first_message ?? '',
    patch.avatar_path ?? null,
    patch.sort_order ?? 0,
    now,
    patch.updated_at ?? now,
  );
  return { id, world_id: worldId, ...patch, created_at: now, updated_at: patch.updated_at ?? now };
}

export function insertSession(db, patch = {}) {
  const id = patch.id ?? crypto.randomUUID();
  const now = nowTs(patch.created_at);
  db.prepare(`
    INSERT INTO sessions (id, character_id, world_id, mode, title, compressed_context, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    patch.character_id ?? null,
    patch.world_id ?? null,
    patch.mode ?? 'chat',
    patch.title ?? null,
    patch.compressed_context ?? null,
    now,
    patch.updated_at ?? now,
  );
  return { id, ...patch, created_at: now, updated_at: patch.updated_at ?? now };
}

export function insertMessage(db, sessionId, patch = {}) {
  const id = patch.id ?? crypto.randomUUID();
  const now = nowTs(patch.created_at);
  db.prepare(`
    INSERT INTO messages (id, session_id, role, content, attachments, is_compressed, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    sessionId,
    patch.role ?? 'user',
    patch.content ?? '',
    patch.attachments ? JSON.stringify(patch.attachments) : null,
    patch.is_compressed ?? 0,
    now,
  );
  return { id, session_id: sessionId, ...patch, created_at: now };
}

function insertStateField(db, table, ownerColumn, ownerId, patch = {}) {
  const id = patch.id ?? crypto.randomUUID();
  const now = nowTs(patch.created_at);
  db.prepare(`
    INSERT INTO ${table} (
      id, ${ownerColumn}, field_key, label, type, description, default_value,
      update_mode, trigger_mode, trigger_keywords, enum_options, min_value, max_value,
      allow_empty, update_instruction, sort_order, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    ownerId,
    patch.field_key ?? 'field',
    patch.label ?? '字段',
    patch.type ?? 'text',
    patch.description ?? '',
    patch.default_value ?? null,
    patch.update_mode ?? 'manual',
    patch.trigger_mode ?? 'manual_only',
    patch.trigger_keywords ? JSON.stringify(patch.trigger_keywords) : null,
    patch.enum_options ? JSON.stringify(patch.enum_options) : null,
    patch.min_value ?? null,
    patch.max_value ?? null,
    patch.allow_empty ?? 1,
    patch.update_instruction ?? '',
    patch.sort_order ?? 0,
    now,
    patch.updated_at ?? now,
  );
  return { id, ...patch, created_at: now, updated_at: patch.updated_at ?? now };
}

export function insertWorldStateField(db, worldId, patch = {}) {
  return insertStateField(db, 'world_state_fields', 'world_id', worldId, patch);
}

export function insertCharacterStateField(db, worldId, patch = {}) {
  return insertStateField(db, 'character_state_fields', 'world_id', worldId, patch);
}

export function insertPersonaStateField(db, worldId, patch = {}) {
  return insertStateField(db, 'persona_state_fields', 'world_id', worldId, patch);
}

function insertStateValue(db, table, ownerColumn, ownerId, patch = {}) {
  const id = patch.id ?? crypto.randomUUID();
  const now = nowTs(patch.updated_at);
  db.prepare(`
    INSERT INTO ${table} (id, ${ownerColumn}, field_key, default_value_json, runtime_value_json, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    id,
    ownerId,
    patch.field_key ?? 'field',
    patch.default_value_json ?? null,
    patch.runtime_value_json ?? null,
    now,
  );
  return { id, ...patch, updated_at: now };
}

export function insertWorldStateValue(db, worldId, patch = {}) {
  return insertStateValue(db, 'world_state_values', 'world_id', worldId, patch);
}

export function insertCharacterStateValue(db, characterId, patch = {}) {
  return insertStateValue(db, 'character_state_values', 'character_id', characterId, patch);
}

export function insertPersonaStateValue(db, worldId, patch = {}) {
  return insertStateValue(db, 'persona_state_values', 'world_id', worldId, patch);
}

export function insertTurnRecord(db, sessionId, patch = {}) {
  const id = patch.id ?? crypto.randomUUID();
  const now = nowTs(patch.created_at);
  db.prepare(`
    INSERT INTO turn_records (id, session_id, round_index, summary, user_context, asst_context, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    sessionId,
    patch.round_index ?? 0,
    patch.summary ?? '摘要',
    patch.user_context ?? '用户：...',
    patch.asst_context ?? 'AI：...',
    now,
  );
  return { id, session_id: sessionId, ...patch, created_at: now };
}

function insertPromptEntry(db, table, ownerColumn, ownerId, patch = {}) {
  const id = patch.id ?? crypto.randomUUID();
  const now = nowTs(patch.created_at);
  const baseColumns = ownerColumn ? `${ownerColumn}, ` : '';
  const basePlaceholders = ownerColumn ? '?, ' : '';
  const baseValues = ownerColumn ? [ownerId] : [];
  const hasMode = table === 'global_prompt_entries';
  const modeColumns = hasMode ? 'mode, ' : '';
  const modePlaceholders = hasMode ? '?, ' : '';
  const modeValues = hasMode ? [patch.mode ?? 'chat'] : [];

  db.prepare(`
    INSERT INTO ${table} (
      id, ${baseColumns}title, description, content, keywords, keyword_scope, ${modeColumns}sort_order, created_at, updated_at
    ) VALUES (?, ${basePlaceholders}?, ?, ?, ?, ?, ${modePlaceholders}?, ?, ?)
  `).run(
    id,
    ...baseValues,
    patch.title ?? '条目',
    patch.description ?? '',
    patch.content ?? '',
    patch.keywords ? JSON.stringify(patch.keywords) : null,
    patch.keyword_scope ?? 'user,assistant',
    ...modeValues,
    patch.sort_order ?? 0,
    now,
    patch.updated_at ?? now,
  );
  return { id, ...patch, created_at: now, updated_at: patch.updated_at ?? now };
}

export function insertGlobalEntry(db, patch = {}) {
  return insertPromptEntry(db, 'global_prompt_entries', null, null, patch);
}

export function insertWorldEntry(db, worldId, patch = {}) {
  return insertPromptEntry(db, 'world_prompt_entries', 'world_id', worldId, patch);
}

export function insertCharacterEntry(db, characterId, patch = {}) {
  return insertPromptEntry(db, 'character_prompt_entries', 'character_id', characterId, patch);
}

export function insertRegexRule(db, patch = {}) {
  const id = patch.id ?? crypto.randomUUID();
  const now = nowTs(patch.created_at);
  db.prepare(`
    INSERT INTO regex_rules (id, name, enabled, pattern, replacement, flags, scope, world_id, mode, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    patch.name ?? '规则',
    patch.enabled ?? 1,
    patch.pattern ?? '',
    patch.replacement ?? '',
    patch.flags ?? 'g',
    patch.scope ?? 'prompt_only',
    patch.world_id ?? null,
    patch.mode ?? 'chat',
    patch.sort_order ?? 0,
    now,
    patch.updated_at ?? now,
  );
  return { id, ...patch, created_at: now, updated_at: patch.updated_at ?? now };
}
