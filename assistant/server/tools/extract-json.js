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

  if (stripped) {
    const result = tryExtractFrom(stripped, prefer);
    if (result) return result;
  }

  // 回退：GLM-5.1 等模型会把最终 JSON 输出放进 reasoning_content，
  // openai-compatible provider 将其包装为 <think>...JSON...</think>，
  // 此时 stripLeadingThinkBlocks 会把整段 JSON 一并剥掉。
  // 在外层全部失败（或剥离后为空）时，从 think 块体内部再扫一次。
  const insideThink = extractThinkBlockBodies(text);
  for (const body of insideThink) {
    const inner = tryExtractFrom(body, prefer);
    if (inner) return inner;
  }

  if (!stripped) throw new Error('输出格式错误：输出为空');
  throw new Error('输出格式错误：找不到 JSON 对象');
}

function extractThinkBlockBodies(text) {
  const bodies = [];
  const re = /<think>([\s\S]*?)<\/think>/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m[1]) bodies.push(m[1]);
  }
  return bodies;
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

/**
 * 尝试修复 LLM 常见 JSON 瑕疵：尾部逗号、行注释、块注释。
 * 修复策略保守——字符串内容不做处理，避免引入错误。
 */
function attemptRepair(text) {
  try {
    // 1. 移除块注释（贪婪匹配最短块）
    let r = text.replace(/\/\*[\s\S]*?\*\//g, '');
    // 2. 移除 // 行注释（只移除行内 // 到行尾，不处理字符串内 //）
    //    用简单逐行方式：跳过字符串内容太复杂，用 regex 保守处理
    r = r.replace(/([^"':\\])\/\/[^\n]*/g, '$1');
    // 3. 移除 trailing comma（逗号后仅有空白和 } 或 ]）
    r = r.replace(/,(\s*[}\]])/g, '$1');
    return r.trim();
  } catch {
    return null;
  }
}

function tryParseObject(text) {
  try {
    const parsed = JSON.parse(text);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
      return { ok: false, reason: 'not-object' };
    }
    return { ok: true, value: parsed };
  } catch {
    // 首次解析失败，尝试修复常见 LLM JSON 瑕疵后再解析
    const repaired = attemptRepair(text);
    if (repaired && repaired !== text) {
      try {
        const parsed = JSON.parse(repaired);
        if (parsed && !Array.isArray(parsed) && typeof parsed === 'object') {
          return { ok: true, value: parsed };
        }
      } catch {
        // 修复后仍失败，继续走后续策略
      }
    }
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
