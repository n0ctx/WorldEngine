/**
 * state-value-format.js — 状态字段值的裸字符串容错解析 + 通用格式化片段（共享实现）
 *
 * 三处消费方各自的语义并不完全相同（StateValueField.jsx 是编辑态，只需要解析；
 * StatusSection.jsx 的 parseValue 只在 JSON.parse 成功时才应用类型格式化，解析失败
 * 时整体回退为原始字符串；StateExtractPreviewModal.jsx 的 formatDisplayValue 则无论
 * 解析是否成功都统一按类型格式化），因此这里只收敛三处逐字节相同、抽出来不会改变任一
 * 调用方行为的最小公共部分：
 *   - parseLooseJson：JSON.parse 失败时回退为原始字符串
 *   - formatBooleanDisplay / formatListDisplay：纯函数，接手"何时调用"的判断仍留在各自调用方
 *   - ISO_DATETIME_RE / formatDatetimeChinese：日期显示格式化，prefix 可选
 * 不合并的部分：StatusSection.parseValue 在 JSON.parse 失败时不对 boolean/list 应用类型格式化
 * （直接原样展示裸字符串），如果强行统一成"总是格式化"会改变已落库裸字符串（如遗留种子默认值）
 * 的现有展示效果，所以那部分判断逻辑保留在 StatusSection.jsx 内。
 */

export const ISO_DATETIME_RE = /^(\d+)-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** JSON.parse 失败时回退为原始字符串；null/undefined 直接返回 null */
export function parseLooseJson(raw) {
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** boolean 值的中文展示：true/'true'/'1'/1 → 是，其余 → 否 */
export function formatBooleanDisplay(v) {
  return (v === true || v === 'true' || v === '1' || v === 1) ? '是' : '否';
}

/** list 值的中文展示：非数组或空数组 → null（由调用方决定 null 如何呈现） */
export function formatListDisplay(v) {
  if (!Array.isArray(v) || v.length === 0) return null;
  return v.join('、');
}

/** datetime ISO 字符串渲染为 "{prefix}X年X月X日X时X分"（去前导零） */
export function formatDatetimeChinese(iso, prefix = '') {
  const m = iso.match(ISO_DATETIME_RE);
  if (!m) return iso;
  const [, y, mo, d, h, min] = m;
  const strip = (s) => String(parseInt(s, 10));
  return `${prefix}${strip(y)}年${strip(mo)}月${strip(d)}日${strip(h)}时${strip(min)}分`;
}
