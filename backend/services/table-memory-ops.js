/**
 * table-memory-ops.js — 表格记忆纯函数：ops 执行 + md 渲染
 * 不做 IO、不调 LLM，便于单测。
 */
import { TABLE_SCHEMAS, TABLE_KEYS, FIELD_MAX_CHARS, clampRowLimit } from './table-memory-schema.js';

// 后端兜底自动归档的原因标记（副 LLM 未按上限主动归档时触发）
export const AUTO_ARCHIVE_REASON = '系统自动归档（超出行数上限）';

export function clampField(v) {
  return String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, FIELD_MAX_CHARS);
}

// 只保留该表的合法列（含内置「别名」），其余丢弃；返回清洗后的值对象
function sanitizeRow(tableKey, raw) {
  const cols = TABLE_SCHEMAS[tableKey].columns;
  const out = {};
  for (const col of cols) {
    if (raw[col] != null && raw[col] !== '') out[col] = clampField(raw[col]);
  }
  if (raw['别名'] != null && raw['别名'] !== '') out['别名'] = clampField(raw['别名']);
  return out;
}

/**
 * 执行 ops 并维护各表行数上限。
 * @param {object} tables   当前表对象
 * @param {Array}  ops      副 LLM 产出的操作数组
 * @param {object} [rowLimits] key→上限（0/缺省=不限制）。LLM 应在 prompt 引导下先 close
 *   最不重要的行；这里是兜底：若某表仍超限，按 id 从小到大（最旧）强制归档多余行。
 * @returns {{tables, applied, dropped, autoArchived: Object<string,number>}}
 */
export function applyOps(tables, ops, rowLimits = {}) {
  const next = JSON.parse(JSON.stringify(tables)); // 深拷贝，绝不改入参
  let applied = 0;
  let dropped = 0;
  const autoArchived = {};
  const list = Array.isArray(ops) ? ops : [];

  for (const op of list) {
    const tableKey = op && typeof op === 'object' ? op.table : undefined;
    if (!tableKey || !TABLE_KEYS.includes(tableKey)) { dropped++; continue; }
    const t = next.tables[tableKey];

    switch (op.op) {
      case 'noop':
        break;
      case 'add': {
        const row = sanitizeRow(tableKey, op.row || {});
        if (Object.keys(row).length === 0) { dropped++; break; }
        row.id = t.nextId++;
        t.rows.push(row);
        applied++;
        break;
      }
      case 'update': {
        const target = t.rows.find((r) => r.id === op.id);
        if (!target || !op.fields || typeof op.fields !== 'object') { dropped++; break; }
        const clean = sanitizeRow(tableKey, op.fields);
        if (Object.keys(clean).length === 0) { dropped++; break; }
        Object.assign(target, clean);
        applied++;
        break;
      }
      case 'close': {
        const idx = t.rows.findIndex((r) => r.id === op.id);
        if (idx < 0) { dropped++; break; }
        const [moved] = t.rows.splice(idx, 1);
        if (op.reason != null && op.reason !== '') moved['归档原因'] = clampField(op.reason);
        next.archive[tableKey].push(moved);
        applied++;
        break;
      }
      default:
        dropped++;
    }
  }

  // 兜底：执行完所有 op 后，仍超限的表按最旧（id 最小）强制归档多余行。
  // 仅当 LLM 未按上限规则主动归档时才会触发。
  for (const key of TABLE_KEYS) {
    const limit = clampRowLimit(rowLimits?.[key], 0);
    if (limit <= 0) continue; // 0 = 不限制
    const t = next.tables[key];
    if (t.rows.length <= limit) continue;
    const overflow = t.rows.length - limit;
    const byOldest = [...t.rows].sort((a, b) => a.id - b.id);
    const evicted = new Set(byOldest.slice(0, overflow).map((r) => r.id));
    const kept = [];
    for (const row of t.rows) {
      if (evicted.has(row.id)) {
        if (row['归档原因'] == null || row['归档原因'] === '') row['归档原因'] = AUTO_ARCHIVE_REASON;
        next.archive[key].push(row);
      } else {
        kept.push(row);
      }
    }
    t.rows = kept;
    autoArchived[key] = overflow;
  }

  return { tables: next, applied, dropped, autoArchived };
}

function renderOneTable(tableKey, rows, withId) {
  const schema = TABLE_SCHEMAS[tableKey];
  const hasAlias = rows.some((r) => r['别名'] != null && r['别名'] !== '');
  const header = [...(withId ? ['id'] : []), ...schema.columns, ...(hasAlias ? ['别名'] : [])];
  const cell = (v) => String(v ?? '').replace(/\|/g, '\\|');
  const lines = [];
  lines.push(`### ${schema.name}`);
  lines.push(`| ${header.join(' | ')} |`);
  lines.push(`| ${header.map(() => '---').join(' | ')} |`);
  for (const r of rows) {
    const vals = header.map((col) => cell(col === 'id' ? r.id : r[col]));
    lines.push(`| ${vals.join(' | ')} |`);
  }
  return lines.join('\n');
}

export function renderTablesToMarkdown(tables, { withId = false } = {}) {
  const blocks = [];
  for (const key of TABLE_KEYS) {
    const rows = tables?.tables?.[key]?.rows ?? [];
    if (rows.length === 0) continue;
    blocks.push(renderOneTable(key, rows, withId));
  }
  return blocks.join('\n\n');
}
