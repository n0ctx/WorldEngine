// 中文字符范围（CJK Unified Ideographs 主区 + 常见标点）
const CJK_REGEX = /[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\uff00-\uffef]/;

/**
 * 估算文本的 token 数。
 * - 中文字符：1 字符 ≈ 0.5 token
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
  return Math.ceil(cjkCount * 0.5 + otherCount * 0.25);
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
