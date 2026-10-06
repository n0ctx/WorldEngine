// 中文字符范围（CJK Unified Ideographs 主区 + 常见标点）
const CJK_REGEX = /[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\uff00-\uffef]/;
/** 每个中文字符折算的 token 数 */
const CJK_TOKENS_PER_CHAR = 0.78;

/**
 * 估算文本的 token 数。
 * - 中文字符：1 字符 ≈ 0.78 token
 * - 其他字符：1 字符 ≈ 0.25 token
 */
export function countTokens(text) {
  if (!text) return 0;

  let cjkCount = 0;
  let otherCount = 0;
  for (const ch of text) {
    if (CJK_REGEX.test(ch)) {
      cjkCount++;
    } else {
      otherCount++;
    }
  }
  return Math.ceil(cjkCount * CJK_TOKENS_PER_CHAR + otherCount * 0.25);
}

/**
 * 对 messages 数组求 token 总和。
 * 每条消息结构：{ role, content, ... }
 */
export function countMessages(messages) {
  let total = 0;
  for (const msg of messages) {
    total += countTokens(msg.content);
  }
  return total;
}

/** 每条消息的角色与分隔符折算的 token 数 */
const MESSAGE_OVERHEAD_TOKENS = 4;

function contentText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((part) => (typeof part?.text === 'string' ? part.text : '')).join('');
}

/**
 * 估算一次带工具的模型请求占用的 token 数：消息正文、assistant 的工具调用、工具结果与工具定义都计入。
 */
export function countContextTokens(messages, toolDefs = []) {
  let total = toolDefs.length ? countTokens(JSON.stringify(toolDefs)) : 0;
  for (const msg of messages) {
    total += MESSAGE_OVERHEAD_TOKENS + countTokens(contentText(msg.content));
    if (msg.tool_calls?.length) total += countTokens(JSON.stringify(msg.tool_calls));
  }
  return total;
}
