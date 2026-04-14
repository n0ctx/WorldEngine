import crypto from 'node:crypto';
import db from '../index.js';

/**
 * 创建 CSS 片段，sort_order 默认取当前 MAX+1
 */
export function createCustomCssSnippet(data) {
  const id = crypto.randomUUID();
  const now = Date.now();
  const maxRow = db.prepare('SELECT MAX(sort_order) AS m FROM custom_css_snippets').get();
  const sortOrder = data.sort_order ?? ((maxRow?.m ?? -1) + 1);

  db.prepare(`
    INSERT INTO custom_css_snippets (id, name, enabled, content, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.name, data.enabled ?? 1, data.content ?? '', sortOrder, now, now);

  return getCustomCssSnippetById(id);
}

/**
 * 根据 id 获取单条
 */
export function getCustomCssSnippetById(id) {
  return db.prepare('SELECT * FROM custom_css_snippets WHERE id = ?').get(id);
}

/**
 * 获取所有片段，按 sort_order ASC, created_at ASC
 */
export function listCustomCssSnippets() {
  return db.prepare(
    'SELECT * FROM custom_css_snippets ORDER BY sort_order ASC, created_at ASC',
  ).all();
}

/**
 * 部分更新，白名单：name / enabled / content
 */
export function updateCustomCssSnippet(id, patch) {
  const allowed = ['name', 'enabled', 'content'];
  const sets = [];
  const values = [];

  for (const field of allowed) {
    if (field in patch) {
      sets.push(`${field} = ?`);
      values.push(patch[field]);
    }
  }

  if (sets.length === 0) return getCustomCssSnippetById(id);

  sets.push('updated_at = ?');
  values.push(Date.now(), id);
  db.prepare(`UPDATE custom_css_snippets SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return getCustomCssSnippetById(id);
}

/**
 * 硬删除
 */
export function deleteCustomCssSnippet(id) {
  return db.prepare('DELETE FROM custom_css_snippets WHERE id = ?').run(id);
}

/**
 * 批量重排序，传入 [{id, sort_order}, ...] 数组
 */
export function reorderCustomCssSnippets(items) {
  const stmt = db.prepare('UPDATE custom_css_snippets SET sort_order = ?, updated_at = ? WHERE id = ?');
  const now = Date.now();
  const tx = db.transaction(() => {
    for (const item of items) {
      stmt.run(item.sort_order, now, item.id);
    }
  });
  tx();
}
