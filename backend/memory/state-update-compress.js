/**
 * state-update-compress.js — combined-state-updater 超限字段的 LLM 压缩
 *
 * 检查 patch 中 text/list 字段是否超出长度上限，超限时调用 LLM 压缩后就地写回 patch。
 */

import * as llm from '../llm/index.js';
import {
  LLM_STATE_COMPRESS_MAX_TOKENS,
  STATE_TEXT_MAX_LENGTH,
  STATE_TEXT_COMPRESS_TARGET,
  STATE_LIST_MAX_ITEMS,
  STATE_LIST_TRIM_TARGET,
  LLM_BACKGROUND_TASK_TIMEOUT_MS,
} from '../utils/constants.js';
import { createLogger, formatMeta, previewText } from '../utils/logger.js';
import { renderBackendPrompt } from '../prompts/prompt-loader.js';
import { resolveAuxScope } from '../utils/aux-scope.js';
import { findJsonObjectText, repairJsonIssues } from './state-update-json.js';

const log = createLogger('all-state');

/**
 * 检查 patch 中 text/list 字段是否超限，超限时调用 LLM 压缩后就地修改 patch。
 * 必须在 applyStatePatch 之前调用，以便 validateValue 处理压缩后的值。
 */
function collectOverLimitFields(entityFieldPairs) {
  const overLengthText = [];
  const overLengthList = [];

  for (const { entityKey, fields, patchData, valueMap } of entityFieldPairs) {
    const fieldMap = Object.fromEntries(fields.map((f) => [f.field_key, f]));
    if (patchData) {
      for (const [key, value] of Object.entries(patchData)) {
        const field = fieldMap[key];
        if (!field) continue;
        if (field.type === 'text' && typeof value === 'string' && value.length > STATE_TEXT_MAX_LENGTH) {
          overLengthText.push({ entityKey, fieldKey: key, value });
        } else if (field.type === 'list' && Array.isArray(value) && value.length > STATE_LIST_MAX_ITEMS) {
          overLengthList.push({ entityKey, fieldKey: key, value });
        }
      }
    }
    // 兜底：LLM 未在本轮 patch 中提及的字段，若现有运行时值已超限，也加入压缩队列；
    // 否则一旦历史数据超过阈值，将永远无法被收敛回上限。
    if (!valueMap) continue;
    for (const field of fields) {
      const key = field.field_key;
      if (patchData && Object.prototype.hasOwnProperty.call(patchData, key)) continue;
      const cur = valueMap[key];
      const json = cur?.runtimeValueJson;
      if (!json) continue;
      let parsed;
      try { parsed = JSON.parse(json); } catch { continue; }
      if (field.type === 'text' && typeof parsed === 'string' && parsed.length > STATE_TEXT_MAX_LENGTH) {
        overLengthText.push({ entityKey, fieldKey: key, value: parsed });
      } else if (field.type === 'list' && Array.isArray(parsed) && parsed.length > STATE_LIST_MAX_ITEMS) {
        overLengthList.push({ entityKey, fieldKey: key, value: parsed });
      }
    }
  }

  return { overLengthText, overLengthList };
}

function parseCompressedResponse(raw, sid) {
  let compressed = null;
  if (raw) {
    try {
      const jsonStr = findJsonObjectText(raw);
      if (jsonStr) {
        try { compressed = JSON.parse(jsonStr); }
        catch { compressed = JSON.parse(repairJsonIssues(jsonStr)); }
      }
    } catch {
      log.warn(`COMPRESS PARSE FAIL  ${formatMeta({ session: sid, preview: previewText(raw) })}`);
    }
  }
  return compressed && typeof compressed === 'object' ? compressed : {};
}

function applyCompressedFields(patch, compressed, overLengthText, overLengthList, sid) {
  // 确保 patch[entityKey] 是普通对象；若 LLM 返回畸形桶（字符串/数字/数组等），
  // 直接覆盖为 {}，避免给非对象赋属性触发严格模式 TypeError 中断整个更新流程。
  const ensureBucket = (entityKey) => {
    const cur = patch[entityKey];
    if (!cur || typeof cur !== 'object' || Array.isArray(cur)) patch[entityKey] = {};
    return patch[entityKey];
  };

  for (const { entityKey, fieldKey } of overLengthText) {
    const val = compressed?.[entityKey]?.[fieldKey];
    if (typeof val === 'string' && val.length > 0) {
      ensureBucket(entityKey)[fieldKey] = val;
      log.info(`COMPRESS TEXT OK  ${formatMeta({ session: sid, field: `${entityKey}.${fieldKey}`, chars: val.length })}`);
    }
  }
  for (const { entityKey, fieldKey, value: original } of overLengthList) {
    const val = compressed?.[entityKey]?.[fieldKey];
    if (Array.isArray(val) && val.length > 0 && val.length <= STATE_LIST_MAX_ITEMS) {
      ensureBucket(entityKey)[fieldKey] = val;
      log.info(`COMPRESS LIST OK  ${formatMeta({ session: sid, field: `${entityKey}.${fieldKey}`, items: val.length })}`);
    } else {
      // 兜底：LLM 未返回有效裁剪结果时，硬截取最近的 STATE_LIST_TRIM_TARGET 条，避免列表无限增长
      const trimmed = original.slice(-STATE_LIST_TRIM_TARGET);
      ensureBucket(entityKey)[fieldKey] = trimmed;
      log.warn(`COMPRESS LIST FALLBACK  ${formatMeta({ session: sid, field: `${entityKey}.${fieldKey}`, from: original.length, to: trimmed.length })}`);
    }
  }
}

export async function compressOverLimitFields(patch, entityFieldPairs, sid, sessionId) {
  const { overLengthText, overLengthList } = collectOverLimitFields(entityFieldPairs);

  if (overLengthText.length === 0 && overLengthList.length === 0) return;

  log.info(`COMPRESS  ${formatMeta({ session: sid, text: overLengthText.length, list: overLengthList.length })}`);

  const textSection = overLengthText.length > 0
    ? `## 文本压缩\n以下字段值过长（超过 ${STATE_TEXT_MAX_LENGTH} 字），请将每个值压缩到 ${STATE_TEXT_COMPRESS_TARGET} 字以内，保留核心信息：\n` +
      overLengthText.map((x) => `- ${x.entityKey}.${x.fieldKey}（${x.value.length}字）: ${x.value}`).join('\n')
    : '';

  const listSection = overLengthList.length > 0
    ? `## 列表裁剪\n以下列表字段条目过多（超过 ${STATE_LIST_MAX_ITEMS} 个），请保留最重要/最新的 ${STATE_LIST_TRIM_TARGET} 个条目，丢弃最久远、价值最低的条目，返回字符串数组：\n` +
      overLengthList.map((x) => `- ${x.entityKey}.${x.fieldKey}（${x.value.length}条）: ${JSON.stringify(x.value)}`).join('\n')
    : '';

  // 稳定前缀（cacheableSystem）：压缩任务的通用指令 + 输出格式，逐字节稳定。
  // 动态后缀（user 段）：本轮待压缩的具体字段值，逐次变化，不进缓存。
  const cacheableSystem = renderBackendPrompt('state-compress.md');
  const runtimeUser = renderBackendPrompt('state-compress-runtime.md', { TEXT_SECTION: textSection, LIST_SECTION: listSection });
  const prompt = [
    { role: 'system', content: cacheableSystem },
    { role: 'user', content: runtimeUser },
  ];

  const raw = await llm.complete(prompt, {
    temperature: 0,
    maxTokens: LLM_STATE_COMPRESS_MAX_TOKENS,
    configScope: resolveAuxScope(sessionId),
    callType: 'state_compress',
    conversationId: sessionId,
    cacheableSystem,
    timeoutMs: LLM_BACKGROUND_TASK_TIMEOUT_MS,
  });

  const compressed = parseCompressedResponse(raw, sid);
  applyCompressedFields(patch, compressed, overLengthText, overLengthList, sid);
}
