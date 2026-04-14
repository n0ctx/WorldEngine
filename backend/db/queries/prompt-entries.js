import crypto from 'node:crypto';
import db from '../index.js';

// ─── 通用工具 ───────────────────────────────────────────────────

function parseKeywords(row) {
  if (!row) return row;
  return {
    ...row,
    keywords: row.keywords ? JSON.parse(row.keywords) : null,
  };
}

function parseAll(rows) {
  return rows.map(parseKeywords);
}

// ─── global_prompt_entries ───────────────────────────────────────

export function createGlobalEntry(data) {
  const id = crypto.randomUUID();
  const now = Date.now();
  const maxRow = db.prepare('SELECT MAX(sort_order) AS m FROM global_prompt_entries').get();
  const sortOrder = data.sort_order ?? ((maxRow?.m ?? -1) + 1);

  db.prepare(`
    INSERT INTO global_prompt_entries (id, title, summary, content, keywords, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.title,
    data.summary ?? '',
    data.content ?? '',
    data.keywords != null ? JSON.stringify(data.keywords) : null,
    sortOrder,
    now,
    now,
  );
  return getGlobalEntryById(id);
}

export function getGlobalEntryById(id) {
  return parseKeywords(db.prepare('SELECT * FROM global_prompt_entries WHERE id = ?').get(id));
}

export function getAllGlobalEntries() {
  return parseAll(db.prepare('SELECT * FROM global_prompt_entries ORDER BY sort_order ASC, created_at ASC').all());
}

export function updateGlobalEntry(id, patch) {
  const allowed = ['title', 'summary', 'content', 'keywords', 'sort_order'];
  const sets = [];
  const values = [];

  for (const field of allowed) {
    if (field in patch) {
      sets.push(`${field} = ?`);
      values.push(field === 'keywords'
        ? (patch.keywords != null ? JSON.stringify(patch.keywords) : null)
        : patch[field]);
    }
  }

  if (sets.length === 0) return getGlobalEntryById(id);

  sets.push('updated_at = ?');
  values.push(Date.now(), id);
  db.prepare(`UPDATE global_prompt_entries SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return getGlobalEntryById(id);
}

export function deleteGlobalEntry(id) {
  return db.prepare('DELETE FROM global_prompt_entries WHERE id = ?').run(id);
}

export function reorderGlobalEntries(orderedIds) {
  const stmt = db.prepare('UPDATE global_prompt_entries SET sort_order = ?, updated_at = ? WHERE id = ?');
  const now = Date.now();
  db.transaction(() => {
    orderedIds.forEach((id, index) => stmt.run(index, now, id));
  })();
}

// ─── world_prompt_entries ────────────────────────────────────────

export function createWorldEntry(data) {
  const id = crypto.randomUUID();
  const now = Date.now();
  const maxRow = db.prepare('SELECT MAX(sort_order) AS m FROM world_prompt_entries WHERE world_id = ?').get(data.world_id);
  const sortOrder = data.sort_order ?? ((maxRow?.m ?? -1) + 1);

  db.prepare(`
    INSERT INTO world_prompt_entries (id, world_id, title, summary, content, keywords, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.world_id,
    data.title,
    data.summary ?? '',
    data.content ?? '',
    data.keywords != null ? JSON.stringify(data.keywords) : null,
    sortOrder,
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
  const allowed = ['title', 'summary', 'content', 'keywords', 'sort_order'];
  const sets = [];
  const values = [];

  for (const field of allowed) {
    if (field in patch) {
      sets.push(`${field} = ?`);
      values.push(field === 'keywords'
        ? (patch.keywords != null ? JSON.stringify(patch.keywords) : null)
        : patch[field]);
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

// ─── character_prompt_entries ────────────────────────────────────

export function createCharacterEntry(data) {
  const id = crypto.randomUUID();
  const now = Date.now();
  const maxRow = db.prepare('SELECT MAX(sort_order) AS m FROM character_prompt_entries WHERE character_id = ?').get(data.character_id);
  const sortOrder = data.sort_order ?? ((maxRow?.m ?? -1) + 1);

  db.prepare(`
    INSERT INTO character_prompt_entries (id, character_id, title, summary, content, keywords, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.character_id,
    data.title,
    data.summary ?? '',
    data.content ?? '',
    data.keywords != null ? JSON.stringify(data.keywords) : null,
    sortOrder,
    now,
    now,
  );
  return getCharacterEntryById(id);
}

export function getCharacterEntryById(id) {
  return parseKeywords(db.prepare('SELECT * FROM character_prompt_entries WHERE id = ?').get(id));
}

export function getAllCharacterEntries(characterId) {
  return parseAll(db.prepare('SELECT * FROM character_prompt_entries WHERE character_id = ? ORDER BY sort_order ASC, created_at ASC').all(characterId));
}

export function updateCharacterEntry(id, patch) {
  const allowed = ['title', 'summary', 'content', 'keywords', 'sort_order'];
  const sets = [];
  const values = [];

  for (const field of allowed) {
    if (field in patch) {
      sets.push(`${field} = ?`);
      values.push(field === 'keywords'
        ? (patch.keywords != null ? JSON.stringify(patch.keywords) : null)
        : patch[field]);
    }
  }

  if (sets.length === 0) return getCharacterEntryById(id);

  sets.push('updated_at = ?');
  values.push(Date.now(), id);
  db.prepare(`UPDATE character_prompt_entries SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return getCharacterEntryById(id);
}

export function deleteCharacterEntry(id) {
  return db.prepare('DELETE FROM character_prompt_entries WHERE id = ?').run(id);
}

export function reorderCharacterEntries(characterId, orderedIds) {
  const stmt = db.prepare('UPDATE character_prompt_entries SET sort_order = ?, updated_at = ? WHERE id = ? AND character_id = ?');
  const now = Date.now();
  db.transaction(() => {
    orderedIds.forEach((id, index) => stmt.run(index, now, id, characterId));
  })();
}

// ─── 副作用清理辅助查询（只读） ──────────────────────────────────

/**
 * 获取某角色下所有 Prompt 条目的 embedding_id（过滤 NULL）
 * @param {string} characterId
 * @returns {string[]}
 */
export function getEmbeddingIdsByCharacterId(characterId) {
  return db.prepare(
    'SELECT embedding_id FROM character_prompt_entries WHERE character_id = ? AND embedding_id IS NOT NULL',
  ).all(characterId).map((r) => r.embedding_id);
}

/**
 * 获取某世界下所有 Prompt 条目的 embedding_id（world 级 + 该 world 下所有 character 级；过滤 NULL；去重）
 * @param {string} worldId
 * @returns {string[]}
 */
export function getEmbeddingIdsByWorldId(worldId) {
  const rows = db.prepare(`
    SELECT embedding_id FROM world_prompt_entries
    WHERE world_id = ? AND embedding_id IS NOT NULL
    UNION
    SELECT embedding_id FROM character_prompt_entries
    WHERE character_id IN (SELECT id FROM characters WHERE world_id = ?)
      AND embedding_id IS NOT NULL
  `).all(worldId, worldId);
  return rows.map((r) => r.embedding_id);
}
