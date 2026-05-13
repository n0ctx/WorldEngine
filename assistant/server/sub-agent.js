/**
 * 通用执行子代理
 *
 * dispatchSubAgent({ stepId, targetType, operation, entityRef, task, context })
 *   → { success, summary }
 *
 * 干净上下文：每次调用独立组装 system prompt（基础 prompt + targetType 对应知识文件），
 * 不继承父代理 / 用户对话。LLM 通过 backend/llm/completeWithTools 走非流式 tool-use 循环。
 *
 * 工具定义形态（项目级 splitTools 期望）：
 *   { type: 'function', function: { name, description, parameters }, execute: async (args) => ... }
 *
 * 因 apply_* 工具仅暴露 bare definition（{ name, description, parameters }）+ 独立 execute 函数，
 * 这里通过 toLLMTool() 适配为统一形态。
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as llm from '../../backend/llm/index.js';
import { getConfig } from '../../backend/services/config.js';
import { createLogger, formatMeta, previewText } from '../../backend/utils/logger.js';

import * as taskStore from './task-store.js';
import { toLLMTool, wrapToolEvents } from './tools/adapter.js';
import { loadWithCache } from './knowledge-cache.js';
import * as applyWorldCard from './tools/apply-world-card.js';
import * as applyCharacterCard from './tools/apply-character-card.js';
import * as applyPersonaCard from './tools/apply-persona-card.js';
import * as applyGlobalConfig from './tools/apply-global-config.js';
import * as applyCssSnippet from './tools/apply-css-snippet.js';
import * as applyRegexRule from './tools/apply-regex-rule.js';
import * as listResources from './tools/list-resources.js';
import { createPreviewCardTool } from './tools/card-preview.js';
import { READ_FILE_TOOL } from './tools/project-reader.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const log = createLogger('as-subagent', 'magenta');

const APPLY_BY_TYPE = {
  'world-card': applyWorldCard,
  'character-card': applyCharacterCard,
  'persona-card': applyPersonaCard,
  'global-config': applyGlobalConfig,
  'css-snippet': applyCssSnippet,
  'regex-rule': applyRegexRule,
};

const KNOWLEDGE_BY_TYPE = {
  'world-card': 'WORLDCARD.md',
  'character-card': 'CHARCARD.md',
  'persona-card': 'USERCARD.md',
  'global-config': 'GLOBALPROMPT.md',
  'css-snippet': 'CSSSNIPPET.md',
  'regex-rule': 'REGEXRULE.md',
};

const PROMPT_PATH = path.resolve(__dirname, '../prompts/sub-agent.md');
const KNOWLEDGE_DIR = path.resolve(__dirname, '../knowledge');

async function loadPrompt() {
  return loadWithCache(PROMPT_PATH);
}

async function loadKnowledge(targetType) {
  const fileName = KNOWLEDGE_BY_TYPE[targetType];
  if (!fileName) throw new Error(`No knowledge file for targetType "${targetType}"`);
  const full = path.join(KNOWLEDGE_DIR, fileName);
  return loadWithCache(full);
}

function buildUserMessage({ stepId, targetType, operation, entityRef, task, context }) {
  const ctxView = {
    worldId: context?.worldId ?? null,
    characterId: context?.characterId ?? null,
    snapshot: context?.snapshot ?? null,
    extra: context?.extra ?? null,
  };
  const lines = [
    `# 本次 step`,
    ``,
    `- stepId: ${stepId ?? 'n/a'}`,
    `- targetType: ${targetType}`,
    `- operation: ${operation}`,
    `- entityRef: ${entityRef ?? 'null'}`,
    ``,
    `## 任务`,
    ``,
    String(task ?? '').trim() || '(空任务，请基于知识与 context 推断)',
    ``,
    `## 上下文（已由父代理整理）`,
    ``,
    '```json',
    JSON.stringify(ctxView, null, 2),
    '```',
    ``,
    `请按 system prompt 的工作流落库一次，然后用不超过 200 字的纯文本总结结果。`,
  ];
  return lines.join('\n');
}

/**
 * 解析 entityRef 占位符 → 实际 ID
 * 支持：'context.worldId' / 'context.characterId' / 字面量 ID / null
 */
function resolveEntityRef(entityRef, context) {
  if (!entityRef) return null;
  if (entityRef === 'context.worldId') return context?.worldId ?? null;
  if (entityRef === 'context.characterId') return context?.characterId ?? null;
  return entityRef;
}

export async function dispatchSubAgent({
  stepId = null,
  targetType,
  operation = 'update',
  entityRef = null,
  task = '',
  context = {},
  taskId = null,
  emitFn = null,
  runId = null,
  cancelCheck = null,
  onApplied = null,
} = {}) {
  const apply = APPLY_BY_TYPE[targetType];
  if (!apply) throw new Error(`No apply tool for targetType "${targetType}"`);

  const resolvedEntityId = resolveEntityRef(entityRef, context);
  const worldRefId = context?.worldId ?? null;

  const [basePrompt, knowledge] = await Promise.all([loadPrompt(), loadKnowledge(targetType)]);
  const systemPrompt = `${basePrompt}\n\n---\n\n# 知识：${targetType}\n\n${knowledge}`;

  const previewTool = createPreviewCardTool({
    worldId: context?.worldId ?? null,
    characterId: context?.characterId ?? null,
    world: context?.world ?? null,
    character: context?.character ?? null,
  });

  const wrapOpts = cancelCheck ? { cancelCheck } : undefined;
  let applySuccessCount = 0;
  let lastApplyError = null;
  let previewedThisRun = false;
  // preview 缓存 key：task 内同实体的多步 update 共享，避免每步都重新拉一次 preview。
  // 没有 taskId / entityId 时回退到 run 内 flag。
  const previewCacheKey = (resolvedEntityId && taskId)
    ? `${targetType}:${resolvedEntityId}`
    : null;
  if (previewCacheKey && taskStore.hasFreshPreview(taskId, previewCacheKey)) {
    previewedThisRun = true;
  }
  // 包一层 preview_card,记录已经 preview 过
  const wrappedPreview = {
    type: 'function',
    function: previewTool.function,
    execute: async (args) => {
      const res = await previewTool.execute(args);
      previewedThisRun = true;
      const entityId = args?.entityId ?? resolvedEntityId ?? null;
      if (taskId && entityId) {
        taskStore.markPreviewed(taskId, `${args?.target ?? targetType}:${entityId}`);
      }
      return res;
    },
  };
  const tools = [
    wrapToolEvents(wrappedPreview, emitFn, wrapOpts),
    wrapToolEvents(toLLMTool(listResources), emitFn, wrapOpts),
    wrapToolEvents(toLLMTool(READ_FILE_TOOL), emitFn, wrapOpts),
    wrapToolEvents(toLLMTool(apply, async (args) => {
      const op = args.operation ?? operation;
      if ((op === 'update' || op === 'delete') && !previewedThisRun) {
        // 闸门:update / delete 必须先 preview_card 拉现状,否则极易写错字段 / ID
        const hint = `请先调用 preview_card(target="${targetType}", operation="${op}"`
          + (resolvedEntityId ? `, entityId="${resolvedEntityId}"` : '')
          + ') 拉取当前数据,再决定 apply 入参。这次先不真正落库,看到 preview 结果后重试。';
        lastApplyError = hint;
        return { success: false, error: hint };
      }
      try {
        const res = await apply.execute(args, { worldRefId });
        if (res?.success !== false) {
          applySuccessCount += 1;
          if (onApplied) {
            try {
              onApplied({
                kind: targetType,
                op,
                name: args.changes?.name ?? null,
                refId: res?.personaId ?? res?.entityId ?? res?.id ?? null,
              });
            } catch { /* ignore */ }
          }
        } else {
          lastApplyError = res?.error ?? `${apply.definition.name} 返回 success:false`;
        }
        return res;
      } catch (err) {
        lastApplyError = err?.message ?? String(err);
        throw err;
      }
    }), emitFn, wrapOpts),
  ];

  const messages = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: buildUserMessage({
        stepId,
        targetType,
        operation,
        entityRef: resolvedEntityId ?? entityRef,
        task,
        context,
      }),
    },
  ];

  const config = getConfig();
  const configScope = config.assistant?.model_source === 'aux' ? 'aux' : 'main';

  log.info(`START  ${formatMeta({
    runId,
    stepId,
    targetType,
    operation,
    entityRef: resolvedEntityId ?? entityRef,
    task: previewText(task, { limit: 120 }),
  })}`);

  try {
    const raw = await llm.completeWithTools(messages, tools, {
      temperature: 0.3,
      thinking_level: null,
      configScope,
      cacheableSystem: systemPrompt,
    });
    // 子代理总结截断策略：
    // - 命中错误关键词（失败 / 不存在 / 字段缺失 / 校验 等）→ 不截断，原样回传给父代理，避免修复建议被切掉
    // - 否则提高上限到 1500 字符（旧值 400 太紧，会丢失多步骤报告的尾部）
    const rawText = String(raw ?? '').trim();
    const ERROR_KEYWORDS = /(error|失败|错误|不存在|未找到|缺失|无法|拒绝|invalid|forbidden|conflict|未通过|校验|冲突)/i;
    const summary = ERROR_KEYWORDS.test(rawText) ? rawText : rawText.slice(0, 1500);
    if (applySuccessCount === 0) {
      log.warn(`FAIL_NO_APPLY  ${formatMeta({ runId, stepId, targetType, lastError: lastApplyError, summary: previewText(summary, { limit: 80 }) })}`);
      return {
        success: false,
        error: lastApplyError
          ? `子代理未成功落库（${apply.definition.name} 最后一次错误：${lastApplyError}）；模型自述：${summary || '(空)'}`
          : `子代理未成功调用 ${apply.definition.name}（apply 工具一次都没执行成功）；模型自述：${summary || '(空)'}`,
      };
    }
    log.info(`DONE  ${formatMeta({ runId, stepId, targetType, applyCount: applySuccessCount, chars: summary.length })}`);
    return { success: true, summary };
  } catch (err) {
    log.error(`FAIL  ${formatMeta({ runId, stepId, targetType, error: err.message })}`);
    return { success: false, error: err.message };
  }
}

export const __testables = {
  toLLMTool,
  resolveEntityRef,
  buildUserMessage,
  KNOWLEDGE_BY_TYPE,
  APPLY_BY_TYPE,
};
