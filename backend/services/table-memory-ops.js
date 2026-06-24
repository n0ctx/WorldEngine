/**
 * table-memory-ops.js — 表格记忆纯函数：ops 执行 + md 渲染
 * 不做 IO、不调 LLM，便于单测。
 */
import { TABLE_SCHEMAS, TABLE_KEYS, FIELD_MAX_CHARS } from './table-memory-schema.js';

function clampField(v) {
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

export function applyOps(tables, ops) {
  const next = JSON.parse(JSON.stringify(tables)); // 深拷贝，绝不改入参
  let applied = 0;
  let dropped = 0;
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
        next.archive[tableKey].push(moved);
        applied++;
        break;
      }
      default:
        dropped++;
    }
  }
  return { tables: next, applied, dropped };
}
