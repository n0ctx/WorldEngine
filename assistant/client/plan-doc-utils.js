/**
 * 写卡助手计划文档（markdown）解析工具
 *
 * 计划文档由父代理通过 SSE `plan_doc_updated` 推送 markdown 全文，
 * 其中含 `- [ ]` / `- [x]` 任务项；这里提供前端渲染需要的统计与解析。
 */

const TASK_LINE_RE = /^\s*-\s*\[\s*([ x])\s*\]\s*(.+?)\s*$/gim;

export function countCheckboxes(md) {
  const text = String(md ?? '');
  let total = 0;
  let done = 0;
  // 用同一正则统计 done/total；reset lastIndex 避免 g 标志在复用 RegExp 时跳格
  const re = /^\s*-\s*\[\s*([ x])\s*\]/gim;
  let match;
  while ((match = re.exec(text)) !== null) {
    total += 1;
    if (match[1].toLowerCase() === 'x') done += 1;
  }
  return { total, done };
}

export function parseTaskLines(md) {
  const text = String(md ?? '');
  const out = [];
  const re = new RegExp(TASK_LINE_RE.source, TASK_LINE_RE.flags);
  let match;
  while ((match = re.exec(text)) !== null) {
    out.push({ checked: match[1].toLowerCase() === 'x', text: match[2] });
  }
  return out;
}
