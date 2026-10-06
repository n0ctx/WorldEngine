// 模型可写字段的类型归一：能无歧义转换的转换，其余报错并说明期望。配合 common.js 的 parseFields 使用。

import { fail } from './common.js';

function describe(value) {
  if (Array.isArray(value)) return '数组';
  if (value === null) return 'null';
  return { string: '文本', number: '数字', boolean: '布尔值', object: '对象' }[typeof value] ?? typeof value;
}

export function text(value, name) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fail(`${name} 需要文本，收到${describe(value)}`);
}

const BOOL_WORDS = { true: true, false: false, 1: true, 0: false };

export function bool(value, name) {
  if (typeof value === 'boolean') return value;
  const word = BOOL_WORDS[String(value).trim().toLowerCase()];
  if (typeof word !== 'boolean' || typeof value === 'object') fail(`${name} 需要 true 或 false，收到 ${JSON.stringify(value)}`);
  return word;
}

export function numberOrNull(value, name) {
  if (value == null || value === '') return null;
  const num = typeof value === 'number' ? value : (typeof value === 'string' ? Number(value.trim()) : NaN);
  if (!Number.isFinite(num)) fail(`${name} 需要数字，收到 ${JSON.stringify(value)}`);
  return num;
}

export function intAtLeast(min) {
  return (value, name) => {
    const num = numberOrNull(value, name);
    if (!Number.isInteger(num) || num < min) fail(`${name} 需要不小于 ${min} 的整数，收到 ${JSON.stringify(value)}`);
    return num;
  };
}

export function intOrNull(value, name) {
  const num = numberOrNull(value, name);
  if (num !== null && !Number.isInteger(num)) fail(`${name} 需要整数，收到 ${JSON.stringify(value)}`);
  return num;
}

// 数组，或用逗号、顿号、换行分隔的一段文本。
export function stringList(value, name) {
  if (value == null) return [];
  const items = typeof value === 'string' ? value.split(/[,，、\n]/) : value;
  if (!Array.isArray(items)) fail(`${name} 需要文本数组，如 ["甲", "乙"]，收到${describe(value)}`);
  return items.map((item) => text(item, `${name} 的每一项`).trim()).filter(Boolean);
}

export function oneOf(options, { upper = false } = {}) {
  return (value, name) => {
    const raw = typeof value === 'string' ? value.trim() : value;
    const picked = upper && typeof raw === 'string' ? raw.toUpperCase() : raw;
    if (!options.includes(picked)) fail(`${name} 只能是 ${options.join(' / ')}，收到 ${JSON.stringify(value)}`);
    return picked;
  };
}

// 对象，或写成 JSON 文本的对象。
export function object(value, name) {
  if (value == null) return value;
  let parsed = value;
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value); } catch { /* 交给下面统一报错 */ }
  }
  if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) fail(`${name} 必须是对象，收到${describe(value)}`);
  return parsed;
}

export function array(value, name) {
  if (value == null) return value;
  if (!Array.isArray(value)) fail(`${name} 必须是数组，收到${describe(value)}`);
  return value;
}

export const any = (value) => value;
