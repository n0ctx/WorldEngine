// 统一的 <think>/<thinking> 推理块清洗工具。
//
// 历史上 sub-agent.js / parent-agent.js / tools/extract-json.js 各自实现了一份，
// 覆盖的标签变体（think vs thinking）、是否处理未闭合块各不相同，模型换 think 风格时
// 只有部分路径生效。此处收口为单一真源。
//
// - 默认先剥成对闭合块；再剥"只剩开标签没有闭标签"的残留（流式中断 / 截断常见），
//   避免原始推理整段泄漏进父代理摘要或错误文案、撑爆 token。

const CLOSED_THINK_RE = /<\s*think(?:ing)?\s*>[\s\S]*?<\s*\/\s*think(?:ing)?\s*>/gi;
const UNCLOSED_THINK_RE = /<\s*think(?:ing)?\s*>[\s\S]*$/i;

export function stripThinkBlocks(text, { unclosed = true } = {}) {
  let out = String(text ?? '').replace(CLOSED_THINK_RE, '');
  if (unclosed) out = out.replace(UNCLOSED_THINK_RE, '');
  return out.trim();
}
