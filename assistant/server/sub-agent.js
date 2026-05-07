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

/**
 * 把任意一种工具导出形态规整成 splitTools 期望的形态：
 *   { type:'function', function:{name,description,parameters}, execute }
 *
 * 支持三种入参：
 *   - bare definition + execute：{ definition: { name, description, parameters }, execute }
 *   - wrapped definition + execute：{ definition: { type, function }, execute }
 *   - 已成形的 tool 对象：{ type, function, execute }
 */
function toLLMTool(input, executeOverride) {
  // 已是成形 tool（card-preview 工厂返回值即此形态）
  if (input && input.type === 'function' && input.function && typeof input.execute === 'function') {
    return input;
  }
  const def = input?.definition ?? input;
  const exec = executeOverride ?? input?.execute;
  if (typeof exec !== 'function') {
    throw new Error('toLLMTool: missing execute function');
  }
  if (def?.type === 'function' && def.function) {
    return { type: 'function', function: def.function, execute: exec };
  }
  if (def?.name) {
    return {
      type: 'function',
      function: {
        name: def.name,
        description: def.description,
        parameters: def.parameters,
      },
      execute: exec,
    };
  }
  throw new Error('toLLMTool: unrecognized definition shape');
}

/**
 * 包装工具 execute：在执行前后发 tool_call_started / tool_call_completed SSE 事件。
 */
function wrapToolEvents(tool, emitFn) {
  if (!emitFn) return tool;
  const name = tool.function?.name ?? 'unknown';
  return {
    ...tool,
    execute: async (args) => {
      const callId = Math.random().toString(36).slice(2, 8);
      emitFn({ type: 'tool_call_started', toolName: name, callId });
      try {
        const result = await tool.execute(args);
        emitFn({ type: 'tool_call_completed', toolName: name, callId, success: true });
        return result;
      } catch (err) {
        emitFn({ type: 'tool_call_completed', toolName: name, callId, success: false });
        throw err;
      }
    },
  };
}

async function loadPrompt() {
  return readFile(PROMPT_PATH, 'utf-8');
}

async function loadKnowledge(targetType) {
  const fileName = KNOWLEDGE_BY_TYPE[targetType];
  if (!fileName) throw new Error(`No knowledge file for targetType "${targetType}"`);
  const full = path.join(KNOWLEDGE_DIR, fileName);
  return readFile(full, 'utf-8');
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
  emitFn = null,
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

  const tools = [
    wrapToolEvents(toLLMTool(previewTool), emitFn),
    wrapToolEvents(toLLMTool(listResources), emitFn),
    wrapToolEvents(toLLMTool(READ_FILE_TOOL), emitFn),
    wrapToolEvents(toLLMTool(apply, async (args) => apply.execute(args, { worldRefId })), emitFn),
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
    });
    const summary = String(raw ?? '').trim().slice(0, 400);
    log.info(`DONE  ${formatMeta({ stepId, targetType, chars: summary.length })}`);
    return { success: true, summary };
  } catch (err) {
    log.error(`FAIL  ${formatMeta({ stepId, targetType, error: err.message })}`);
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
