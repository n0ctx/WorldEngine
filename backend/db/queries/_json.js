/**
 * _json.js — 以 JSON 字符串存储的列的读写
 */

/** 解析 JSON 列；空值或非法 JSON 时返回 fallback */
export function parseJson(raw, fallback) {
  if (typeof raw !== 'string' || raw.length === 0) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/** 序列化为 JSON 列；value 为 null / undefined 时写入 fallback */
export function encodeJson(value, fallback) {
  return JSON.stringify(value ?? fallback);
}
