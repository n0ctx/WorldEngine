/**
 * state-field-validate.js — 状态字段值类型校验（共享实现）
 *
 * 从 backend/memory/combined-state-updater.js 提取，供状态更新（回合内 LLM patch）
 * 与状态提取（人设一次性推断建议值）两处复用，避免同一套类型规则出现两份实现。
 *
 * 注意：backend/services/state-values.js 里的 validateStateValue 是另一套独立实现，
 * 服务于"用户在字段管理界面手填 value_json"场景（table 列级越界直接拒绝整条、无
 * list 超限硬截断），语义与这里的"LLM 输出宽松校验"不同，不在此合并。
 */

import { STATE_LIST_MAX_ITEMS } from './constants.js';
import { createLogger, formatMeta, previewText } from './logger.js';

const log = createLogger('state-validate');

const ISO_DATETIME_RE = /^\d+-\d{2}-\d{2}T\d{2}:\d{2}$/;

/**
 * 校验 LLM 返回的值是否符合字段类型约束。
 * 返回 undefined 表示校验失败（丢弃）；返回 null 表示允许空值。
 */
export function validateValue(value, field) {
  if (value === null || value === undefined || value === '') {
    return field.allow_empty ? null : undefined;
  }

  switch (field.type) {
    case 'text': {
      if (typeof value !== 'string') return undefined;
      return value;
    }
    case 'number': {
      const num = typeof value === 'number' ? value : Number(value);
      if (!isFinite(num)) return undefined;
      if (field.min_value != null && num < field.min_value) return undefined;
      if (field.max_value != null && num > field.max_value) return undefined;
      return num;
    }
    case 'boolean': {
      if (typeof value === 'boolean') return value;
      if (value === 'true') return true;
      if (value === 'false') return false;
      return undefined;
    }
    case 'enum': {
      if (typeof value !== 'string') return undefined;
      if (field.enum_options && !field.enum_options.includes(value)) return undefined;
      return value;
    }
    case 'datetime': {
      if (typeof value !== 'string') return undefined;
      return ISO_DATETIME_RE.test(value) ? value : undefined;
    }
    case 'list': {
      if (typeof value === 'string') {
        value = value.split(/[,，、]/).map((s) => s.trim()).filter(Boolean);
      }
      if (!Array.isArray(value)) return undefined;
      const items = value.map(String).filter(Boolean);
      if (items.length === 0) return field.allow_empty ? [] : undefined;
      if (items.length > STATE_LIST_MAX_ITEMS) {
        log.warn(`LIST HARD TRUNCATE  ${formatMeta({ field: field.field_key, from: items.length, to: STATE_LIST_MAX_ITEMS })}`);
        return items.slice(-STATE_LIST_MAX_ITEMS);
      }
      return items;
    }
    case 'table': {
      const cols = Array.isArray(field.table_columns) ? field.table_columns : [];
      if (cols.length === 0) return undefined;
      let obj = value;
      if (typeof obj === 'string') {
        try { obj = JSON.parse(obj); } catch {
          log.warn(`TABLE DROP  ${formatMeta({ field: field.field_key, reason: 'string-not-json', raw: previewText(String(value)) })}`);
          return undefined;
        }
      }
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
        // 最常见失败：模型把 table 当多行表格输出成数组/嵌套
        log.warn(`TABLE DROP  ${formatMeta({ field: field.field_key, reason: Array.isArray(obj) ? 'got-array' : 'not-object', raw: previewText(JSON.stringify(value)) })}`);
        return undefined;
      }
      const out = {};
      const skipped = [];
      for (const col of cols) {
        if (!col || typeof col.key !== 'string') continue;
        if (!(col.key in obj)) continue;
        const raw = obj[col.key];
        const num = typeof raw === 'number' ? raw : Number(raw);
        if (!isFinite(num)) { skipped.push(`${col.key}=${JSON.stringify(raw)}`); continue; }
        let v = num;
        if (col.min != null && v < col.min) v = col.min;
        if (col.max != null && v > col.max) v = col.max;
        out[col.key] = v;
      }
      if (skipped.length) {
        log.warn(`TABLE COL SKIP  ${formatMeta({ field: field.field_key, reason: 'non-numeric', cols: skipped.join(', ') })}`);
      }
      if (Object.keys(out).length === 0) {
        log.warn(`TABLE DROP  ${formatMeta({ field: field.field_key, reason: 'no-valid-col', keys: Object.keys(obj).join(', ') })}`);
        return field.allow_empty ? {} : undefined;
      }
      return out;
    }
    default:
      return undefined;
  }
}
