/**
 * 模板变量替换 — 类 SillyTavern 风格（前端镜像）
 *
 * 支持的占位符（大小写不敏感）：
 *   {{user}}  → 用户人设名（persona.name）
 *   {{char}}  → 角色名（character.name）
 *   {{world}} → 世界名（world.name）
 *
 * 与 backend/utils/template-vars.js 等价，仅用于展示层（状态栏等）替换。
 * 不修改任何持久化数据。
 *
 * @param {string|null|undefined} text  待处理文本
 * @param {{ user?: string, char?: string, world?: string }} ctx  替换上下文
 * @returns {string|null|undefined}
 */
export function applyTemplateVars(text, ctx = {}) {
  if (text == null) return text;
  let out = typeof text === 'string' ? text : String(text);
  // ctx[key] === null 视为"不替换该占位符"，与 backend/utils/template-vars.js 一致
  if (ctx.user !== null) out = out.replace(/\{\{user\}\}/gi, ctx.user ?? '');
  if (ctx.char !== null) out = out.replace(/\{\{char\}\}/gi, ctx.char ?? '');
  if (ctx.world !== null) out = out.replace(/\{\{world\}\}/gi, ctx.world ?? '');
  return out;
}
