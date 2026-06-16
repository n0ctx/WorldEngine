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
import { stripThinkBlocks } from './strip-think.js';
import * as applyWorldCard from './tools/apply-world-card.js';
import * as applyCharacterCard from './tools/apply-character-card.js';
import * as applyPersonaCard from './tools/apply-persona-card.js';
import * as applyGlobalConfig from './tools/apply-global-config.js';
import * as applyCssSnippet from './tools/apply-css-snippet.js';
import * as applyRegexRule from './tools/apply-regex-rule.js';
import * as applyTheme from './tools/apply-theme.js';
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
  'theme': applyTheme,
};

const KNOWLEDGE_BY_TYPE = {
  'world-card': 'WORLDCARD.md',
  'character-card': 'CHARCARD.md',
  'persona-card': 'USERCARD.md',
  'global-config': 'GLOBALPROMPT.md',
  'css-snippet': 'CSSSNIPPET.md',
  'regex-rule': 'REGEXRULE.md',
  'theme': 'THEME.md',
};

// 状态值写法 cheatsheet（value_json 各 type 的精确格式）随这两类卡一并注入子代理 system。
// 这两类卡的状态值若走纯 task 字符串路径（父代理没传结构化 stateValues），子代理就拿不到
// dispatch 工具层生成的"已校验 stateValueOps"块，只能凭知识手写 value_json——cheatsheet 是它的救生圈。
// 仅 605 字，进 cacheableSystem 可缓存，成本极低。
const STATE_VALUE_KNOWLEDGE_TYPES = new Set(['persona-card', 'character-card']);
const STATEVALUE_CHEATSHEET_FILE = 'STATEVALUE-CHEATSHEET.md';

// 子代理工具循环上限：一次只落地一个资源（preview → read → apply），正常 < 8 轮。
// 不用父代理/全局的 25 轮——卡死的子代理在 25 轮里会持续累积重发历史空烧 token。
const SUBAGENT_MAX_TOOL_ITERATIONS = 8;

const PROMPT_PATH = path.resolve(__dirname, '../prompts/sub-agent.md');
const KNOWLEDGE_DIR = path.resolve(__dirname, '../knowledge');

// 子代理总结截断策略：
// - 命中错误关键词（失败 / 不存在 / 字段缺失 / 校验 等）→ 不截断，原样回传给父代理，避免修复建议被切掉
// - 否则提高上限到 1500 字符（旧值 400 太紧，会丢失多步骤报告的尾部）
const ERROR_KEYWORDS_RE = /(error|失败|错误|不存在|未找到|缺失|无法|拒绝|invalid|forbidden|conflict|未通过|校验|冲突)/i;
// 错误分支也设一个高一点的硬上限：避免未闭合 think 块或失控长文整段回传父代理撑爆 token。
const ERROR_TEXT_HARD_LIMIT = 4000;

export function summarizeSubagentText(raw) {
  // 统一 think 清洗（含未闭合块兜底），再压缩多余空行
  const stripped = stripThinkBlocks(raw)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (ERROR_KEYWORDS_RE.test(stripped)) return stripped.slice(0, ERROR_TEXT_HARD_LIMIT);
  return stripped.slice(0, 1500);
}

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
  operation,
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
  // operation 必须由调用方显式给出（来自 plan step 或 dispatch_subagent 参数）。
  // 早期默认成 'update' 会让用户说"新建一张卡"时直接覆盖上下文中的现卡。
  if (!operation || !['create', 'update', 'delete'].includes(operation)) {
    throw new Error(`dispatchSubAgent: operation 必须显式传 create / update / delete，收到："${operation}"`);
  }
  // create 时严禁把上下文里已有资源的 ID 当作 entityRef：那是 update 的语义。
  if (operation === 'create' && entityRef) {
    throw new Error(`dispatchSubAgent: operation:"create" 不能携带 entityRef（收到 "${entityRef}"）。新建资源不应指向已有 ID。`);
  }

  const resolvedEntityId = resolveEntityRef(entityRef, context);
  const worldRefId = context?.worldId ?? null;

  const [basePrompt, knowledge] = await Promise.all([loadPrompt(), loadKnowledge(targetType)]);
  let systemPrompt = `${basePrompt}\n\n---\n\n# 知识：${targetType}\n\n${knowledge}`;
  if (STATE_VALUE_KNOWLEDGE_TYPES.has(targetType)) {
    const cheatsheet = await loadWithCache(path.join(KNOWLEDGE_DIR, STATEVALUE_CHEATSHEET_FILE)).catch(() => '');
    if (cheatsheet) systemPrompt += `\n\n---\n\n# 状态值写法 cheatsheet（写 value_json 必读）\n\n${cheatsheet}`;
  }

  const previewTool = createPreviewCardTool({
    worldId: context?.worldId ?? null,
    characterId: context?.characterId ?? null,
    world: context?.world ?? null,
    character: context?.character ?? null,
  });

  const wrapOpts = cancelCheck ? { cancelCheck } : undefined;
  let applySuccessCount = 0;
  let lastApplyError = null;
  // 幂等：completeWithTools 的重试在整段工具循环外层（5xx/429 自动重试），重试会从第 0 轮重放，
  // 复用同一 handlers 闭包 → 已成功的 apply 会被再次执行。create 会重复建卡；
  // 带 entryOps/stateFieldOps[create] 的 update 会重复建条目/字段。
  // 故按 operation 签名缓存每个已成功 apply 的结果，重放命中同签名时直接返回，不再落库。
  const appliedBySignature = new Map();
  // 兼容旧逻辑：首个成功 create 的结果（onApplied / 日志仍可用）。
  let firstCreateResult = null;
  // 用入参生成稳定签名：op + 目标实体 + 各 ops 数组的内容。禁止纳入随机/时间值。
  const applySignature = (args, op) => {
    try {
      return JSON.stringify({
        op,
        entityId: args?.entityId ?? resolvedEntityId ?? null,
        changes: args?.changes ?? null,
        stateValueOps: args?.stateValueOps ?? null,
        stateFieldOps: args?.stateFieldOps ?? null,
        entryOps: args?.entryOps ?? null,
      });
    } catch {
      return null;
    }
  };
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
      // 重试重放保护：本次 dispatch 已成功执行过相同签名的 apply，直接复用结果，不重复落库。
      // 覆盖 create（重复建卡）与带 entryOps/stateFieldOps[create] 的 update/delete（重复建条目/字段）。
      const sig = applySignature(args, op);
      if (sig && appliedBySignature.has(sig)) {
        // 重放命中：返回首次成功结果的副本并打 skipped 标记，
        // 既保留真实 entityId 供链式 step 引用，又让上层 / 模型识别"本次未重复落库"。
        return { ...appliedBySignature.get(sig), skipped: true, reason: 'duplicate' };
      }
      if ((op === 'update' || op === 'delete') && !previewedThisRun) {
        // 闸门:update / delete 必须先 preview_card 拉现状,否则极易写错字段 / ID
        const hint = `请先调用 preview_card(target="${targetType}", operation="${op}"`
          + (resolvedEntityId ? `, entityId="${resolvedEntityId}"` : '')
          + ') 拉取当前数据,再决定 apply 入参。这次先不真正落库,看到 preview 结果后重试。';
        lastApplyError = hint;
        return { success: false, error: hint };
      }
      // apply 工具内部（_apply-factory.runApply）已把 normalize/apply 抛错转成
      // 结构化 { success:false, error_code, message }，正常不会再 throw。
      // 这里仍保留 try/catch 兜底未预期异常，但**不再 re-throw**：把异常也归一成结构化
      // 错误返回给模型，避免异常冒泡到 completeWithTools 触发"盲目重试 / 重放"（item 1/2）。
      try {
        const res = await apply.execute(args, { worldRefId });
        if (res?.success !== false) {
          applySuccessCount += 1;
          if (sig) appliedBySignature.set(sig, res);
          if (op === 'create' && !firstCreateResult) firstCreateResult = res;
          if (onApplied) {
            try {
              onApplied({
                kind: targetType,
                op,
                name: args.changes?.name ?? null,
                refId: res?.personaId ?? res?.id ?? res?.entityId ?? null,
              });
            } catch { /* ignore */ }
          }
        } else {
          lastApplyError = res?.message ?? res?.error ?? `${apply.definition.name} 返回 success:false`;
        }
        return res;
      } catch (err) {
        const message = err?.message ?? String(err);
        lastApplyError = message;
        return { success: false, error_code: 'apply_failed', message };
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

  const usageRef = {};
  try {
    const raw = await llm.completeWithTools(messages, tools, {
      temperature: 0.3,
      thinking_level: null,
      configScope,
      cacheableSystem: systemPrompt,
      usageRef,
      callType: 'assistant-subagent',
      // 子代理一次只落地一个资源，多数 < 8 轮；不用父代理/全局的 25 轮，避免卡死时空烧 token。
      maxIterations: SUBAGENT_MAX_TOOL_ITERATIONS,
    });
    const summary = summarizeSubagentText(raw);
    if (applySuccessCount === 0) {
      log.warn(`FAIL_NO_APPLY  ${formatMeta({ runId, stepId, targetType, lastError: lastApplyError, summary: previewText(summary, { limit: 80 }) })}`);
      return {
        success: false,
        error: lastApplyError
          ? `子代理未成功落库（${apply.definition.name} 最后一次错误：${lastApplyError}）；模型自述：${summary || '(空)'}`
          : `子代理未成功调用 ${apply.definition.name}（apply 工具一次都没执行成功）；模型自述：${summary || '(空)'}`,
      };
    }
    log.info(`DONE  ${formatMeta({
      runId, stepId, targetType,
      applyCount: applySuccessCount,
      chars: summary.length,
      promptTokens: usageRef.prompt_tokens,
      completionTokens: usageRef.completion_tokens,
      cacheReadTokens: usageRef.cache_read_tokens,
      cacheCreationTokens: usageRef.cache_creation_tokens,
    })}`);
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
  summarizeSubagentText,
  KNOWLEDGE_BY_TYPE,
  APPLY_BY_TYPE,
};
