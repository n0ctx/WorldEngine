import crypto from 'node:crypto';
import db from '../index.js';

// ─── 通用工具 ───────────────────────────────────────────────────

function normalizeToken(value, triggerType) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return 1;
  if (triggerType === 'always') {
    return n >= 0 ? n : 1;
  }
  return n >= 1 ? n : 1;
}

function normalizeKeywordScopeValue(value) {
  if (Array.isArray(value)) {
    const items = value
      .filter((item) => item === 'user' || item === 'assistant');
    const unique = [...new Set(items)];
    return unique.join(',');
  }

  if (typeof value !== 'string') return 'user,assistant';

  const raw = value.trim().toLowerCase();
  if (!raw || raw === 'both') return 'user,assistant';
  if (raw === 'user' || raw === 'assistant') return raw;

  const items = raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item === 'user' || item === 'assistant');
  const unique = [...new Set(items)];
  return unique.join(',');
}

function parseKeywords(row) {
  if (!row) return row;
  return {
    ...row,
    keywords: row.keywords ? JSON.parse(row.keywords) : null,
    keyword_scope: normalizeKeywordScopeValue(row.keyword_scope),
  };
}

function parseAll(rows) {
  return rows.map(parseKeywords);
}

// ─── world_prompt_entries ────────────────────────────────────────

export function createWorldEntry(data) {
  const id = crypto.randomUUID();
  const now = Date.now();
  const maxRow = db.prepare('SELECT MAX(sort_order) AS m FROM world_prompt_entries WHERE world_id = ?').get(data.world_id);
  const sortOrder = data.sort_order ?? ((maxRow?.m ?? -1) + 1);

  db.prepare(`
    INSERT INTO world_prompt_entries (id, world_id, title, description, content, keywords, keyword_scope, trigger_type, sort_order, token, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.world_id,
    data.title,
    data.description ?? '',
    data.content ?? '',
    data.keywords != null ? JSON.stringify(data.keywords) : null,
    normalizeKeywordScopeValue(data.keyword_scope),
    data.trigger_type ?? 'always',
    sortOrder,
    normalizeToken(data.token, data.trigger_type ?? 'always'),
    now,
    now,
  );
  return getWorldEntryById(id);
}

export function getWorldEntryById(id) {
  return parseKeywords(db.prepare('SELECT * FROM world_prompt_entries WHERE id = ?').get(id));
}

export function getAllWorldEntries(worldId) {
  return parseAll(db.prepare('SELECT * FROM world_prompt_entries WHERE world_id = ? ORDER BY sort_order ASC, created_at ASC').all(worldId));
}

export function updateWorldEntry(id, patch) {
  const allowed = ['title', 'description', 'content', 'keywords', 'keyword_scope', 'sort_order', 'trigger_type', 'token'];
  const sets = [];
  const values = [];

  // 计算更新后的 trigger_type，用于 token 归一化（trigger_type 切换时可能需要把 0 钳到 1）
  let effectiveTriggerType = patch.trigger_type;
  if (effectiveTriggerType === undefined && 'token' in patch) {
    effectiveTriggerType = getWorldEntryById(id)?.trigger_type ?? 'always';
  }

  for (const field of allowed) {
    if (field in patch) {
      sets.push(`${field} = ?`);
      values.push(field === 'keywords'
        ? (patch.keywords != null ? JSON.stringify(patch.keywords) : null)
        : field === 'keyword_scope'
          ? normalizeKeywordScopeValue(patch.keyword_scope)
          : field === 'token'
            ? normalizeToken(patch.token, effectiveTriggerType)
            : patch[field]);
    }
  }

  // trigger_type 单独切换（未带 token），且新 trigger_type 非 always 时，需要把现有 token=0 钳到 1
  if ('trigger_type' in patch && !('token' in patch) && patch.trigger_type !== 'always') {
    const current = getWorldEntryById(id);
    if (current && current.token === 0) {
      sets.push('token = ?');
      values.push(1);
    }
  }

  if (sets.length === 0) return getWorldEntryById(id);

  sets.push('updated_at = ?');
  values.push(Date.now(), id);
  db.prepare(`UPDATE world_prompt_entries SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return getWorldEntryById(id);
}

export function deleteWorldEntry(id) {
  return db.prepare('DELETE FROM world_prompt_entries WHERE id = ?').run(id);
}

export function reorderWorldEntries(worldId, orderedIds) {
  const stmt = db.prepare('UPDATE world_prompt_entries SET sort_order = ?, updated_at = ? WHERE id = ? AND world_id = ?');
  const now = Date.now();
  db.transaction(() => {
    orderedIds.forEach((id, index) => stmt.run(index, now, id, worldId));
  })();
}

