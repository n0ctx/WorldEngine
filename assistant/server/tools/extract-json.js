/**
 * 从 LLM 原始输出中提取一个合法的 JSON 对象。
 *
 * 特点：
 * 1. 剥离出现在 JSON 对象之前的 <think>...</think> 前缀块（思考模型推理前缀）
 *    — 判断依据：<think> 起始位置早于第一个 `{` 的位置
 *    — JSON 字符串值内部的 <think> 内容不会被剥离
 * 2. 优先尝试 ```json 代码块
 * 3. 其次尝试整段文本
 * 4. 最后扫描所有顶层 {...} 候选对象，按 prefer 选择 first/last
 */
export function extractJson(raw, options = {}) {
  const prefer = options.prefer === 'first' ? 'first' : 'last';
  const text = String(raw || '').trim();
  if (!text) throw new Error('输出格式错误：输出为空');

  // 只剥离 JSON 对象之前的 <think> 前缀块，保留 JSON 字符串值内的 <think> 内容
  const stripped = stripLeadingThinkBlocks(text);
  if (!stripped) throw new Error('输出格式错误：输出为空');

  const result = tryExtractFrom(stripped, prefer);
  if (result) return result;

  throw new Error('输出格式错误：找不到 JSON 对象');
}

/**
 * 仅剥离出现在第一个 `{` 之前的 <think>...</think> 块。
 * 若 `{` 出现在 <think> 之前（说明 <think> 在 JSON 内容里），则停止剥离。
 */
function stripLeadingThinkBlocks(text) {
  let result = text;
  while (true) {
    const firstThink = result.search(/<think>/i);
    if (firstThink === -1) break;
    const firstBrace = result.indexOf('{');
    // think 块在首个 { 之前 → 是推理前缀，可以安全剥离
    if (firstBrace === -1 || firstThink < firstBrace) {
      result = result.replace(/<think>[\s\S]*?<\/think>/i, '').trim();
    } else {
      // { 在 think 之前 → think 在 JSON 内容里，停止剥离
      break;
    }
  }
  return result;
}

function tryExtractFrom(text, prefer) {
  const codeBlocks = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)]
    .map((m) => m[1]?.trim())
    .filter(Boolean);
  const directCandidates = [text, ...codeBlocks];
  for (const candidate of directCandidates) {
    const parsed = tryParseObject(candidate);
    if (parsed.ok) return parsed.value;
  }

  const slices = collectTopLevelObjectSlices(text);
  const ordered = prefer === 'first' ? slices : [...slices].reverse();
  for (const slice of ordered) {
    const parsed = tryParseObject(slice);
    if (parsed.ok) return parsed.value;
  }

  return null;
}

function tryParseObject(text) {
  try {
    const parsed = JSON.parse(text);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
      return { ok: false, reason: 'not-object' };
    }
    return { ok: true, value: parsed };
  } catch {
    return { ok: false, reason: 'parse-error' };
  }
}

function collectTopLevelObjectSlices(text) {
  const slices = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{') {
      if (depth === 0) start = i;
      depth += 1;
      continue;
    }

    if (ch === '}') {
      if (depth === 0) continue;
      depth -= 1;
      if (depth === 0 && start !== -1) {
        slices.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }

  return slices;
}
