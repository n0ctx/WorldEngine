/**
 * _state-field-helpers.js — 状态字段 service 层共用辅助函数
 *
 * 被以下模块引用：
 *   world-state-fields.js
 *   character-state-fields.js
 *   persona-state-fields.js
 */

/**
 * 获取字段的初始 value_json（即 default_value 原始 JSON 字符串）
 * @param {{ default_value: string|null }} field
 * @returns {string|null}
 */
export function getInitialValueJson(field) {
  return field.default_value ?? null;
}
