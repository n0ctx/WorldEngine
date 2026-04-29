/**
 * raw-logger.js — LLM 原始请求落盘与 prompt cache 诊断
 *
 * 用法：
 *   import { logRawRequest } from '../raw-logger.js';
 *   logRawRequest(body, config, 'stream');   // 在 fetch() 之前调用
 *
 * 启用条件：data/config.json 中 logging.mode="raw" 且 logging.llm_raw.enabled=true
 * 输出：data/logs/llm-raw/{timestamp}-{provider}-{callType}.json
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { shouldLogRaw, createLogger } from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.WE_DATA_DIR
  ? path.resolve(process.env.WE_DATA_DIR)
  : path.resolve(__dirname, '..', '..', 'data');
const RAW_LOG_DIR = path.join(DATA_DIR, 'logs', 'llm-raw');

const log = createLogger('llm-raw', 'blue');

// delta 跟踪：key = "${provider}:${model}:${callType}"
const _prevAnalysis = new Map();

// ─── 基础工具 ──────────────────────────────────────────────────

function sha256(text) {
  return createHash('sha256').update(String(text ?? ''), 'utf-8').digest('hex');
}

/** CJK ≈ 1 token/char，其余 ≈ 4 chars/token */
function estimateTokens(text) {
  if (!text) return 0;
  const cjk = (String(text).match(/[　-鿿豈-﫿가-힯]/g) ?? []).length;
  return Math.ceil(cjk + (String(text).length - cjk) / 4);
}

function preview(text, len = 300) {
  const s = String(text ?? '');
  return s.slice(0, len);
}

function previewTail(text, len = 300) {
  const s = String(text ?? '');
  return s.length > len ? s.slice(-len) : '';
}

// ─── 格式感知的文本提取 ────────────────────────────────────────

/**
 * 从单条 Anthropic message content 提取纯文本和 cache_control 标记
 */
function extractAnthropicContent(content) {
  if (typeof content === 'string') return { text: content, cacheMarkers: [] };
  if (!Array.isArray(content)) return { text: '', cacheMarkers: [] };

  let text = '';
  const cacheMarkers = [];
  for (let i = 0; i < content.length; i++) {
    const part = content[i];
    if (part.type === 'text') text += part.text ?? '';
    else if (part.type === 'image') text += '[image]';
    else if (part.type === 'tool_use') text += JSON.stringify(part.input ?? {});
    else if (part.type === 'tool_result') text += String(part.content ?? '');
    if (part.cache_control) {
      cacheMarkers.push({ partIndex: i, partType: part.type, cacheControl: part.cache_control });
    }
  }
  return { text, cacheMarkers };
}

/**
 * 从单条 Gemini content part 提取文本
 */
function extractGeminiPartText(parts) {
  if (!Array.isArray(parts)) return '';
  return parts.map((p) => {
    if (p.text) return p.text;
    if (p.functionCall) return `[functionCall:${p.functionCall.name}]`;
    if (p.functionResponse) return `[functionResponse:${p.functionResponse.name}]`;
    return '';
  }).join('');
}

/**
 * 探测请求体格式：'anthropic' | 'openai' | 'gemini'
 * - Anthropic: body.messages[].content 可能是 Array<{type,...}>，且 body.system 是顶层字段
 * - Gemini: body.contents，body.systemInstruction
 * - OpenAI: body.messages[]，system 消息在列表中
 */
function detectFormat(body) {
  if (body.contents || body.systemInstruction) return 'gemini';
  // Anthropic 的 body.system 是显式顶层字段（string 或 Array）
  if (body.system !== undefined) return 'anthropic';
  return 'openai';
}

// ─── 单条 message 分析 ─────────────────────────────────────────

function analyzeMessage(msg, index, format) {
  let role = msg.role ?? 'unknown';
  let text = '';
  let cacheMarkers = [];

  if (format === 'gemini') {
    // Gemini: { role: 'user'|'model', parts: [] }
    text = extractGeminiPartText(msg.parts);
  } else if (format === 'anthropic') {
    const extracted = extractAnthropicContent(msg.content);
    text = extracted.text;
    cacheMarkers = extracted.cacheMarkers;
  } else {
    // OpenAI / openai-compatible: content 是 string 或 Array<{type,text,...}>
    if (typeof msg.content === 'string') {
      text = msg.content;
    } else if (Array.isArray(msg.content)) {
      text = msg.content.map((p) => (p.type === 'text' ? p.text ?? '' : '')).join('');
    }
    // OpenAI tool_calls
    if (Array.isArray(msg.tool_calls)) {
      text += msg.tool_calls.map((tc) => `[tool_call:${tc.function?.name}]`).join('');
    }
  }

  return {
    index,
    role,
    charLen: text.length,
    tokens_est: estimateTokens(text),
    hash: sha256(text),
    preview300Head: preview(text),
    preview300Tail: previewTail(text),
    cacheMarkers,
  };
}

// ─── 完整请求分析 ──────────────────────────────────────────────

function analyzeRequest(body, config, callType) {
  const format = detectFormat(body);
  const provider = config.provider ?? 'unknown';
  const model = body.model || config.model || 'unknown';

  // ── 提取 system ──
  let systemText = '';
  let systemCacheMarkers = [];

  if (format === 'anthropic') {
    if (typeof body.system === 'string') {
      systemText = body.system;
    } else if (Array.isArray(body.system)) {
      for (let i = 0; i < body.system.length; i++) {
        const part = body.system[i];
        systemText += part.text ?? '';
        if (part.cache_control) {
          systemCacheMarkers.push({ partIndex: i, cacheControl: part.cache_control });
        }
      }
    }
  } else if (format === 'gemini') {
    const si = body.systemInstruction;
    if (si?.parts) systemText = extractGeminiPartText(si.parts);
  } else {
    // OpenAI: system 消息在 body.messages 中，此处不重复提取（会在 messages 分析中出现）
    systemText = '';
  }

  // ── 提取 messages ──
  const rawMessages = format === 'gemini' ? (body.contents ?? []) : (body.messages ?? []);
  const messageAnalyses = rawMessages.map((msg, i) => analyzeMessage(msg, i, format));

  // ── 提取 tools ──
  let toolNames = [];
  let toolsText = '';
  if (Array.isArray(body.tools) && body.tools.length > 0) {
    if (format === 'gemini') {
      // Gemini: [{ functionDeclarations: [{name,...}] }]
      toolNames = (body.tools[0]?.functionDeclarations ?? []).map((d) => d.name);
    } else {
      // Anthropic: [{name,...}], OpenAI: [{type:'function', function:{name,...}}]
      toolNames = body.tools.map((t) => t.name ?? t.function?.name ?? '?');
    }
    toolsText = JSON.stringify(body.tools);
  }

  // ── 前缀哈希（全文拼接：system + 每条 message 文本） ──
  const allText = systemText + messageAnalyses.map((m) => m.preview300Head + m.preview300Tail).join('');
  function prefixHash(approxTokens) {
    // 保守估算：每 token 对应 4 个 ASCII 字符，CJK 较密，此处用 4 作为上限
    return sha256(allText.slice(0, approxTokens * 4));
  }

  // ── 汇总所有 cache_control 标记 ──
  let cumulativeTokens = 0;
  const allCacheMarkers = [];

  // system 中的标记
  for (const marker of systemCacheMarkers) {
    cumulativeTokens += estimateTokens(systemText);
    allCacheMarkers.push({
      location: 'system',
      partIndex: marker.partIndex,
      cacheControl: marker.cacheControl,
      cumulative_tokens_est: cumulativeTokens,
    });
  }

  // messages 中的标记
  for (const ma of messageAnalyses) {
    cumulativeTokens += ma.tokens_est;
    for (const cm of ma.cacheMarkers) {
      allCacheMarkers.push({
        location: `messages[${ma.index}]`,
        role: ma.role,
        partIndex: cm.partIndex,
        partType: cm.partType,
        cacheControl: cm.cacheControl,
        cumulative_tokens_est: cumulativeTokens,
      });
    }
  }

  return {
    provider,
    model,
    callType,
    format,
    timestamp: new Date().toISOString(),

    // 生成参数
    params: {
      stream: body.stream ?? false,
      temperature: body.temperature ?? body.generationConfig?.temperature,
      max_tokens: body.max_tokens ?? body.generationConfig?.maxOutputTokens,
      thinking: body.thinking ?? body.generationConfig?.thinkingConfig,
      tool_choice: body.tool_choice,
    },

    system: {
      charLen: systemText.length,
      tokens_est: estimateTokens(systemText),
      hash: sha256(systemText),
      preview300Head: preview(systemText),
      preview300Tail: previewTail(systemText),
      cacheMarkers: systemCacheMarkers,
    },

    messages: messageAnalyses,
    messageCount: messageAnalyses.length,
    roles: messageAnalyses.map((m) => m.role),

    tools: {
      count: toolNames.length,
      names: toolNames,
      hash: toolsText ? sha256(toolsText) : null,
    },

    request: {
      canonicalHash: sha256(JSON.stringify(body)),
      messagesOnlyHash: sha256(JSON.stringify(rawMessages)),
      systemOnlyHash: sha256(systemText),
      prefix512Hash: prefixHash(512),
      prefix1024Hash: prefixHash(1024),
      prefix2048Hash: prefixHash(2048),
    },

    allCacheMarkers,
  };
}

// ─── Delta 对比 ────────────────────────────────────────────────

function buildDelta(current, prev) {
  if (!prev) return null;

  const curMsgs = current.messages;
  const preMsgs = prev.messages;
  const changedMessages = [];

  for (let i = 0; i < Math.max(curMsgs.length, preMsgs.length); i++) {
    const cur = curMsgs[i];
    const pre = preMsgs[i];
    if (!cur) { changedMessages.push({ index: i, change: 'removed', role: pre.role }); continue; }
    if (!pre) { changedMessages.push({ index: i, change: 'added', role: cur.role }); continue; }
    if (cur.hash !== pre.hash) {
      changedMessages.push({ index: i, change: 'modified', role: cur.role, prevHash: pre.hash, currHash: cur.hash });
    }
  }

  // 最长公共前缀：拼接 preview 后逐字符比对（受限于 preview 长度，是下界估算）
  const prevFull = preMsgs.map((m) => m.preview300Head).join('');
  const currFull = curMsgs.map((m) => m.preview300Head).join('');
  let lcpChars = 0;
  const minLen = Math.min(prevFull.length, currFull.length);
  for (let i = 0; i < minLen; i++) {
    if (prevFull[i] === currFull[i]) lcpChars++;
    else break;
  }

  return {
    systemHashChanged: current.system.hash !== prev.system.hash,
    toolsHashChanged: current.tools.hash !== prev.tools.hash,
    rolesOrderChanged: JSON.stringify(current.roles) !== JSON.stringify(prev.roles),
    messageCountChanged: current.messageCount !== prev.messageCount,
    changedMessages,
    lcpCharsEst: lcpChars,
    lcpTokensEst: estimateTokens(prevFull.slice(0, lcpChars)),
    prefix512HashStable: current.request.prefix512Hash === prev.request.prefix512Hash,
    prefix1024HashStable: current.request.prefix1024Hash === prev.request.prefix1024Hash,
    prefix2048HashStable: current.request.prefix2048Hash === prev.request.prefix2048Hash,
  };
}

// ─── 主入口 ────────────────────────────────────────────────────

/**
 * 在真正调用 LLM API 的 fetch() 之前调用，落盘完整 request body 及诊断分析。
 * 由 shouldLogRaw('llm_raw') 守卫，未开启时立即返回。
 *
 * @param {object} body      - 即将发送到 LLM API 的 request body（不含 headers，无 API key）
 * @param {object} config    - buildLLMConfig() 返回的配置对象（含 provider / model）
 * @param {string} callType  - 'stream' | 'complete' | 'complete-tools' | 'complete-native' | 'resolve-tools'
 */
export function logRawRequest(body, config, callType) {
  if (!shouldLogRaw('llm_raw')) return;

  let analysis;
  try {
    analysis = analyzeRequest(body, config, callType);
  } catch (err) {
    log.warn(`RAW ANALYSIS ERROR  callType=${callType}  error=${err.message}`);
    return;
  }

  const trackingKey = `${analysis.provider}:${analysis.model}:${callType}`;
  const prev = _prevAnalysis.get(trackingKey);
  let delta = null;
  try {
    delta = buildDelta(analysis, prev);
  } catch (err) {
    log.warn(`RAW DELTA ERROR  callType=${callType}  error=${err.message}`);
  }
  _prevAnalysis.set(trackingKey, analysis);

  // 落盘
  let filePath = null;
  try {
    fs.mkdirSync(RAW_LOG_DIR, { recursive: true });
    const ts = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
    const filename = `${ts}-${analysis.provider}-${callType}.json`;
    filePath = path.join(RAW_LOG_DIR, filename);
    const dump = { _meta: { callType, timestamp: analysis.timestamp, provider: analysis.provider, model: analysis.model }, analysis, delta, rawBody: body };
    fs.writeFileSync(filePath, JSON.stringify(dump, null, 2), 'utf-8');
  } catch (err) {
    log.warn(`RAW WRITE ERROR  callType=${callType}  error=${err.message}`);
  }

  // 摘要日志
  const markerSummary = analysis.allCacheMarkers.map((m) => `${m.location}(≈${m.cumulative_tokens_est}t)`).join(', ') || 'none';
  log.info(
    `RAW REQUEST  provider=${analysis.provider}  model=${analysis.model}  callType=${callType}` +
    `  msgs=${analysis.messageCount}  system_t_est=${analysis.system.tokens_est}` +
    `  tools=${analysis.tools.count}  cache_markers=[${markerSummary}]` +
    (filePath ? `  file=${filePath}` : ''),
  );

  if (delta) {
    const changed = delta.changedMessages.map((c) => `[${c.index}:${c.role}:${c.change}]`).join(',') || 'none';
    log.info(
      `RAW DELTA  provider=${analysis.provider}  callType=${callType}` +
      `  systemChanged=${delta.systemHashChanged}  toolsChanged=${delta.toolsHashChanged}` +
      `  rolesChanged=${delta.rolesOrderChanged}  msgChanges=${delta.changedMessages.length}(${changed})` +
      `  lcp_t_est=${delta.lcpTokensEst}` +
      `  prefix512Stable=${delta.prefix512HashStable}  prefix1024Stable=${delta.prefix1024HashStable}  prefix2048Stable=${delta.prefix2048HashStable}`,
    );
  }
}
