/**
 * 从消息正文中提取用于「预览」场景（如世界层故事线卡片）的纯文本片段。
 *
 * 必须剥离：
 *  1. 思考块（<think>…</think> / <thinking>…</thinking>，大小写不敏感）——
 *     标记集合与 frontend/src/core/utils/think-blocks.js 的 THINK_TAG_RE 保持一致，
 *     若前端新增了思考块标记，这里要同步更新。
 *  2. 常见 Markdown 标记（标题、粗斜体、引用、代码块/行内代码、链接、列表符号等）——
 *     预览只要纯文本。
 *
 * 不在这里做的事：不负责判断"这条消息该不该展示"，只负责把一条消息洗成纯文本；
 * 洗完是空串则由调用方决定是否往前找上一条消息。
 */

// 与 frontend/src/core/utils/think-blocks.js 的 THINK_TAG_RE 保持一致
const THINK_BLOCK_RE = /<\s*think(?:ing)?\s*>[\s\S]*?<\s*\/\s*think(?:ing)?\s*>/gi;
// 兜底：流式截断等原因导致只有开标签没有闭标签时，视为思考内容一并丢弃
const THINK_OPEN_UNCLOSED_RE = /<\s*think(?:ing)?\s*>[\s\S]*$/i;

function stripThinkBlocks(text) {
  return text.replace(THINK_BLOCK_RE, '').replace(THINK_OPEN_UNCLOSED_RE, '');
}

// 独占一行的 markdown 分割线（---/***/___）。三个写作/对话正文里都把它当"分节"用；
// backend/utils/turn-dialogue.js 的 unwrapSoloThinkBlock 在"整条回复被单个 <think> 包裹"时
// 会把 think 内文本整段解包保存（含模型未加标签就写在最前面的元指令/规划草稿），
// 这类草稿和正式正文之间也习惯用独立一行的 --- 隔开。取"最后一个分节"既天然避开了
// 这种未加标签的规划前缀，又符合"预览要展示最新剧情节拍"的直觉——不额外维护一份
// "像不像模型规划文本"的分类器（太脆，容易在正常首段+分割线的正文上误伤）。
const HR_SPLIT_RE = /^[ \t]{0,3}(?:-[ \t]?){3,}$|^[ \t]{0,3}(?:_[ \t]?){3,}$|^[ \t]{0,3}(?:\*[ \t]?){3,}$/gm;

function pickLatestSegment(text) {
  const segments = text.split(HR_SPLIT_RE);
  if (segments.length <= 1) return text;
  for (let i = segments.length - 1; i >= 0; i--) {
    if (segments[i].trim()) return segments[i];
  }
  return text;
}

function stripMarkdown(text) {
  return text
    // 代码块围栏 ```lang\n...\n```
    .replace(/```[\s\S]*?```/g, ' ')
    // 行内代码
    .replace(/`([^`]*)`/g, '$1')
    // 图片 ![alt](url)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    // 链接 [text](url)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    // 标题 #
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    // 引用 >
    .replace(/^\s{0,3}>+\s?/gm, '')
    // 粗斜体 ** __ * _
    .replace(/(\*\*\*|___)(.*?)\1/g, '$2')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    // 删除线
    .replace(/~~(.*?)~~/g, '$1')
    // 水平分割线
    .replace(/^\s{0,3}([-*_])\s?(\1\s?){2,}$/gm, ' ')
    // 无序列表符号
    .replace(/^\s{0,3}[-*+]\s+/gm, '')
    // 有序列表符号
    .replace(/^\s{0,3}\d+[.)]\s+/gm, '');
}

/**
 * 提取用于预览的纯文本；洗干净后为空则返回 null。
 */
export function extractPreviewText(content) {
  if (!content) return null;
  let text = String(content);
  text = stripThinkBlocks(text);
  text = pickLatestSegment(text);
  text = stripMarkdown(text);
  text = text.replace(/\s+/g, ' ').trim();
  return text || null;
}
