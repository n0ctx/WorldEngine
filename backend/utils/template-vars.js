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
  const { user = '', char = '', world = '' } = ctx;
  return text
    .replace(/\{\{user\}\}/gi, user)
    .replace(/\{\{char\}\}/gi, char)
    .replace(/\{\{world\}\}/gi, world);
}
