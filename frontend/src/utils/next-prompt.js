const OPEN_TAG = '<think>';
const CLOSE_TAG = '</think>';
const NEXT_OPEN = '<next_prompt>';
const NEXT_CLOSE = '</next_prompt>';

function isInsideOpenThink(text, idx) {
  const before = text.slice(0, idx);
  const opens = (before.match(/<think>/g) || []).length;
  const closes = (before.match(/<\/think>/g) || []).length;
  return opens > closes;
}

/**
 * 解析流式文本中的 <next_prompt> 块。
 * - display: 去掉 <next_prompt>...（或仅 <next_prompt>）后用于展示的文本；位于未闭合 <think> 内的标签也会被剥除。
 * - options: 仅当 <next_prompt> 位于 think 外时才返回选项；位于 think 内时认为是模型思考残留，不渲染为选项卡。
 */
export function parseNextPromptStream(text) {
  const raw = text || '';
  const idx = raw.indexOf(NEXT_OPEN);
  if (idx === -1) return { display: raw, options: [] };
  const display = raw.slice(0, idx);
  if (isInsideOpenThink(raw, idx)) {
    return { display, options: [] };
  }
  const after = raw.slice(idx + NEXT_OPEN.length).replace(NEXT_CLOSE, '');
  const options = after.split('\n').map((s) => s.trim()).filter(Boolean);
  return { display, options };
}

export { OPEN_TAG, CLOSE_TAG, NEXT_OPEN, NEXT_CLOSE };
