/**
 * 模板变量替换 — 类 SillyTavern 风格
 *
 * 支持的占位符（大小写不敏感）：
 *   {{user}}  → 用户人设名（世界级，persona.name）
 *   {{char}}  → 角色名（角色级，character.name）
 *   {{world}} → 世界名（全局，world.name）
 *
 * 替换仅发生在提示词组装时（assembler.js），不修改数据库存储的原始文本。
 * null / undefined 原样返回，不破坏下游的 if (x) 判断。
 *
 * @param {string|null|undefined} text  待处理文本
 * @param {{ user?: string, char?: string, world?: string }} ctx  替换上下文
 * @returns {string|null|undefined}
 */
export function applyTemplateVars(text, ctx = {}) {
  if (!text) return text;
  // ctx[key] === null 视为"不替换该占位符"（保留 `{{xxx}}` 原文交给 LLM 上下文判断），
  // 与 undefined/缺省的语义不同 — 后者会回退为空串再替换，从而清掉占位符。
  let out = text;
  if (ctx.user !== null) out = out.replace(/\{\{user\}\}/gi, ctx.user ?? '');
  if (ctx.char !== null) out = out.replace(/\{\{char\}\}/gi, ctx.char ?? '');
  if (ctx.world !== null) out = out.replace(/\{\{world\}\}/gi, ctx.world ?? '');
  return out;
}
