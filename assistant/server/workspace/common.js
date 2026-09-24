// 工作区共用工具：入参白名单、状态值的存取格式、视图压缩。

export function fail(message) {
  throw new Error(message);
}

// 只接受模型可写字段；多余字段直接报错并列出可用字段，让模型自纠。
export function pickKnown(data, allowed, kind) {
  if (data == null) return {};
  if (typeof data !== 'object' || Array.isArray(data)) fail(`${kind} 的 data 必须是对象`);
  const unknown = Object.keys(data).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    fail(`${kind} 不支持字段 ${unknown.join(', ')}；可用字段：${allowed.join(', ')}`);
  }
  return { ...data };
}

export function requireText(value, name) {
  if (typeof value !== 'string' || !value.trim()) fail(`缺少 ${name}`);
  return value;
}

export function requireObjectKeys(data, message) {
  if (Object.keys(data).length === 0) fail(message);
}

// 与字段编辑器一致的存储格式：list / table 存 JSON，其余存裸字符串。
export function formatFieldDefault(type, value) {
  if (value == null) return null;
  if (type === 'list' || type === 'table') return JSON.stringify(value);
  return String(value);
}

// 解析字段默认值或状态值（value_json）为原生值；兼容裸字符串与 JSON 两种存法。
export function parseStoredValue(type, raw) {
  if (raw == null || raw === '') return null;
  let parsed = raw;
  try { parsed = JSON.parse(raw); } catch { /* 裸字符串 */ }
  if (type === 'number') {
    const num = Number(parsed);
    return Number.isFinite(num) ? num : parsed;
  }
  if (type === 'boolean') return parsed === true || parsed === 'true';
  if (type === 'list' || type === 'table') return parsed;
  return typeof parsed === 'string' ? parsed : String(raw);
}

// 视图里去掉空值，减少模型需要阅读的噪音。
export function compact(obj) {
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    out[key] = value;
  }
  return out;
}

export function toJson(value) {
  return JSON.stringify(value, null, 2);
}
