// 工作区共用工具：入参白名单、状态值的存取格式、视图压缩。

export function fail(message) {
  throw new Error(message);
}

// 只接受模型可写字段，并按 spec（字段名 → 归一函数）把每个值转成约定的类型。
// 多余字段、类型不对的值直接报错并说明期望，让模型自纠；不做静默改写。
// listSources 列出可写成 { add, remove } 的列表字段及其现有值，见 resolveListPatches。
export function parseFields(rawData, spec, kind, listSources = {}) {
  if (rawData == null) return {};
  if (typeof rawData !== 'object' || Array.isArray(rawData)) fail(`${kind} 的 data 必须是对象`);
  const data = resolveListPatches(rawData, listSources);
  const allowed = Object.keys(spec);
  const unknown = Object.keys(data).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    fail(`${kind} 不支持字段 ${unknown.join(', ')}；可用字段：${allowed.join(', ')}`);
  }
  const out = {};
  for (const [key, value] of Object.entries(data)) out[key] = spec[key](value, key);
  return out;
}

// 列表字段的增删写法：{ add: [...], remove: [...] }。数组仍表示整体替换。
export function isListPatch(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && ('add' in value || 'remove' in value);
}

function patchItems(value, name, key) {
  if (value == null) return [];
  if (!Array.isArray(value)) fail(`${name}.${key} 必须是数组，如 { ${key}: ["…"] }`);
  return value;
}

const plainKey = (item) => String(item).trim();

// keyOf 判断两项是否相同（add 时去重）；matches 判断 remove 的目标命中哪些现有项。
export function applyListPatch(current, patch, name, { keyOf = plainKey, matches = (item, target) => keyOf(item) === keyOf(target) } = {}) {
  const unknown = Object.keys(patch).filter((key) => key !== 'add' && key !== 'remove');
  if (unknown.length > 0) fail(`${name} 的增删写法是 { add: [...], remove: [...] }，不支持 ${unknown.join(', ')}`);
  let list = Array.isArray(current) ? [...current] : [];
  for (const target of patchItems(patch.remove, name, 'remove')) {
    if (!list.some((item) => matches(item, target))) {
      fail(`${name} 里没有 ${JSON.stringify(target)}，当前值：${JSON.stringify(list)}`);
    }
    list = list.filter((item) => !matches(item, target));
  }
  for (const item of patchItems(patch.add, name, 'add')) {
    if (!list.some((existing) => keyOf(existing) === keyOf(item))) list.push(item);
  }
  return list;
}

// sources: { 字段名: { current: () => 现有数组, keyOf?, matches? } }。把 data 里写成增删形式的字段换成最终数组。
function resolveListPatches(data, sources) {
  const out = { ...data };
  for (const [key, { current, ...options }] of Object.entries(sources)) {
    if (isListPatch(out[key])) out[key] = applyListPatch(current(), out[key], key, options);
  }
  return out;
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

// 合法 JSON，顶层每个键（或数组每一项）占一行，嵌套不再缩进：比两格缩进省去大量空白。
export function toJson(value) {
  if (Array.isArray(value)) {
    return value.length === 0 ? '[]' : `[\n${value.map((item) => `  ${JSON.stringify(item)}`).join(',\n')}\n]`;
  }
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  const rows = Object.entries(value).filter(([, v]) => v !== undefined).map(([key, v]) => `  ${JSON.stringify(key)}: ${JSON.stringify(v)}`);
  return rows.length === 0 ? '{}' : `{\n${rows.join(',\n')}\n}`;
}
