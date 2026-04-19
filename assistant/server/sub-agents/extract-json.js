/**
 * 从 LLM 原始输出中提取最后一个完整的 JSON 对象。
 *
 * 背景：思维模型（如 GLM5.1、QwQ）会在真正的 JSON 提案前输出大量思考文字，
 * 其中往往夹杂 {...} 片段。贪婪正则 /\{[\s\S]*\}/ 会从第一个 { 一路匹配到
 * 最后一个 }，导致提取结果不是合法 JSON。
 *
 * 本函数改为：
 *   1. 剥离 <think>...</think> 标签块
 *   2. 优先从 ```json 代码块提取
 *   3. 否则从文本末尾逆向查找最后一个完整 {...} 对象（括号计数法）
 */
export function extractJson(raw) {
  // 1. 剥离 <think> 块
  const stripped = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // 2. 优先提取 ```json 代码块
  const codeMatch = stripped.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeMatch) {
    return JSON.parse(codeMatch[1].trim());
  }

  // 3. 从末尾逆向查找最后一个完整的 JSON 对象
  const lastClose = stripped.lastIndexOf('}');
  if (lastClose === -1) throw new Error('子代理输出格式错误：找不到 JSON 对象');

  let depth = 0;
  let start = -1;
  for (let i = lastClose; i >= 0; i--) {
    const ch = stripped[i];
    if (ch === '}') depth++;
    else if (ch === '{') {
      depth--;
      if (depth === 0) { start = i; break; }
    }
  }

  if (start === -1) throw new Error('子代理输出格式错误：JSON 括号不匹配');
  return JSON.parse(stripped.slice(start, lastClose + 1));
}
