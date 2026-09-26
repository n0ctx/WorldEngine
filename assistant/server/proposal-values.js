/**
 * 提案归一化与执行共用的基础取值工具。
 */

const VALID_REGEX_SCOPES = new Set(['user_input', 'ai_output', 'display_only', 'prompt_only']);
const VALID_MODES = new Set(['chat', 'writing']);

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
function normalizeString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
function normalizeEntityId(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
function normalizeMode(value) {
  return VALID_MODES.has(value) ? value : 'chat';
}
function normalizeEnabled(value) {
  return Number(value) === 0 ? 0 : 1;
}
function normalizeNumberOrNull(value) {
  return normalizeNumericOrNull(value, Number.isFinite);
}
function normalizeIntegerOrNull(value) {
  return normalizeNumericOrNull(value, Number.isInteger);
}
function normalizeNumericOrNull(value, isValidNumber) {
  if (value == null || value === '') return null;
  const num = Number(value);
  return isValidNumber(num) ? num : null;
}

function normalizeStringArrayOrNull(value) {
  if (value == null || !Array.isArray(value)) return null;
  const arr = value.map((item) => String(item ?? '').trim()).filter(Boolean);
  return arr.length ? arr : null;
}

function pickAllowed(obj, allowed) {
  const result = {};
  for (const key of allowed) { if (key in obj) result[key] = obj[key]; }
  return result;
}
function deepOmit(obj, keys) {
  const result = { ...obj };
  for (const key of keys) {
    if (key.includes('.')) {
      const [top, ...rest] = key.split('.');
      if (result[top] && typeof result[top] === 'object') result[top] = deepOmit(result[top], [rest.join('.')]);
    } else {
      delete result[key];
    }
  }
  return result;
}

export {
  VALID_REGEX_SCOPES,
  normalizeObject,
  normalizeString,
  normalizeEntityId,
  normalizeMode,
  normalizeEnabled,
  normalizeNumberOrNull,
  normalizeIntegerOrNull,
  normalizeStringArrayOrNull,
  pickAllowed,
  deepOmit,
};
