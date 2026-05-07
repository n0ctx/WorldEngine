/**
 * 父代理（编排者）
 *
 * runParentAgent(task, userInput) → Promise<void>
 *
 * 一次完整的工具循环：
 *   1. 拼装 system prompt（parent-agent.md + CONTRACT.md，每轮注入）
 *   2. 取出 task.messages 作为对话历史，并附加一条上下文 user 消息（status / worldId / characterId / plan-doc 全文）
 *   3. 把 userInput 入栈到 task.messages（包含 `<<approved>>` sentinel 的特殊化处理）
 *   4. 调 backend/llm/completeWithTools 走非流式 tool-use 循环
 *   5. 把最终文本作为单条 `delta` SSE 事件发出 + `done` 事件 + appendMessage
 *
 * 注意：
 *   - LLM 提供商若非流式 + tool-use，则降级为 complete()；这里不区分。
 *   - apply_* 工具的异常被捕获并以 { ok:false, error } 形式返回给 LLM，让它在循环内自行重试。
 *   - 5 个编排专用工具（write_plan_doc / edit_plan_doc / dispatch_subagent / delete_plan_doc / finalize_task）
 *     在本文件内联定义，不抽公共模块（与 sub-agent.js 的 toLLMTool 适配器同源；Phase 5 已确认暂不下沉）。
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as llm from '../../backend/llm/index.js';
import { getConfig } from '../../backend/services/config.js';
import { createLogger, formatMeta, previewText } from '../../backend/utils/logger.js';

import * as planDoc from './plan-doc.js';
import * as taskStore from './task-store.js';
import { dispatchSubAgent } from './sub-agent.js';

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
const log = createLogger('as-parent', 'cyan');

const PROMPT_PATH = path.resolve(__dirname, '../prompts/parent-agent.md');
const CONTRACT_PATH = path.resolve(__dirname, '../knowledge/CONTRACT.md');

const APPLY_TOOLS = {
  apply_world_card: applyWorldCard,
  apply_character_card: applyCharacterCard,
  apply_persona_card: applyPersonaCard,
  apply_global_config: applyGlobalConfig,
  apply_css_snippet: applyCssSnippet,
  apply_regex_rule: applyRegexRule,
};

const APPROVED_SENTINEL = '<<approved>>';

/**
 * 把任意一种工具导出形态规整成 splitTools 期望的形态：
 *   { type:'function', function:{name,description,parameters}, execute }
 *
 * 与 sub-agent.js 的同名函数等价；Phase 5/6 暂不下沉公共模块，等共识稳定再合并。
 */
function toLLMTool(input, executeOverride) {
  if (input && input.type === 'function' && input.function && typeof input.execute === 'function' && !executeOverride) {
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

async function loadSystemPrompt() {
  const [prompt, contract] = await Promise.all([
    readFile(PROMPT_PATH, 'utf-8'),
    readFile(CONTRACT_PATH, 'utf-8'),
  ]);
  return `${prompt}\n\n---\n\n# 助手契约（每轮注入）\n\n${contract}`;
}

/**
 * 包装 apply_* execute：捕获异常并转为 { ok:false, error } 让 LLM 在 tool 循环内重试。
 */
function wrapApply(applyMod, ctx) {
  return async (args) => {
    try {
      const res = await applyMod.execute(args, ctx);
      return { ok: true, ...res };
    } catch (err) {
      log.warn(`APPLY FAIL  ${formatMeta({ tool: applyMod.definition?.name, error: err.message })}`);
      return { ok: false, error: err.message };
    }
  };
}

/**
 * 5 个编排专用工具的内联定义。每个都返回 { definition, execute }。
 * execute 闭包捕获 task，所以必须在每次 runParentAgent 内构造一次。
 */
function buildMetaTools(task) {
  const writePlanDoc = {
    definition: {
      type: 'function',
      function: {
        name: 'write_plan_doc',
        description:
          'plan mode 首次落计划文档；状态自动转 awaiting_approval，等待用户 /approve。' +
          'steps[].id 可省略（自动生成 step-N）。',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: '任务标题（短）' },
            intent: { type: 'string', description: '对用户需求的复述，1-3 句' },
            assumptions: {
              type: 'array',
              items: { type: 'string' },
              description: '来自 preview_card / read_file 的事实假设',
            },
            steps: {
              type: 'array',
              description: '步骤数组，每项含 id?, title, targetType, operation, dependsOn, task',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  title: { type: 'string' },
                  targetType: {
                    type: 'string',
                    enum: ['world-card', 'character-card', 'persona-card', 'global-config', 'css-snippet', 'regex-rule'],
                  },
                  operation: { type: 'string', enum: ['create', 'update', 'delete'] },
                  dependsOn: { type: 'array', items: { type: 'string' } },
                  task: { type: 'string' },
                },
                required: ['title', 'targetType', 'operation', 'task'],
              },
            },
          },
          required: ['title', 'intent', 'steps'],
        },
      },
    },
    execute: async (args) => {
      try {
        const steps = (args.steps ?? []).map((s, i) => ({
          id: s.id ?? `step-${i + 1}`,
          title: s.title,
          targetType: s.targetType,
          operation: s.operation,
          dependsOn: s.dependsOn ?? [],
          task: s.task,
          done: false,
        }));
        const md = planDoc.renderPlanDoc({
          title: args.title,
          status: 'awaiting_approval',
          createdAt: new Date().toISOString(),
          intent: args.intent,
          assumptions: args.assumptions ?? [],
          steps,
          log: [],
        });
        await planDoc.writePlanDoc(task.id, md);
        taskStore.setStatus(task.id, 'awaiting_approval');
        taskStore.emit(task.id, { type: 'plan_doc_updated', taskId: task.id, content: md });
        taskStore.emit(task.id, { type: 'awaiting_approval', taskId: task.id });
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    },
  };

  const editPlanDoc = {
    definition: {
      type: 'function',
      function: {
        name: 'edit_plan_doc',
        description:
          '修改计划文档。op=mark_done 勾选某 step 已完成；op=append_log 追加执行日志行；' +
          'op=replace_steps 整体替换步骤（仅替换未完成步骤；不要修改已 [x] 的步骤）。',
        parameters: {
          type: 'object',
          properties: {
            op: { type: 'string', enum: ['mark_done', 'append_log', 'replace_steps'] },
            stepId: { type: 'string', description: 'mark_done 时必填' },
            line: { type: 'string', description: 'append_log 时必填' },
            steps: {
              type: 'array',
              description: 'replace_steps 时必填，结构同 write_plan_doc 的 steps',
              items: { type: 'object' },
            },
          },
          required: ['op'],
        },
      },
    },
    execute: async (args) => {
      try {
        let md = await planDoc.readPlanDoc(task.id);
        if (args.op === 'mark_done') {
          if (!args.stepId) return { ok: false, error: 'mark_done 需要 stepId' };
          md = planDoc.markStepDone(md, args.stepId, new Date().toISOString().slice(11, 19));
        } else if (args.op === 'append_log') {
          if (!args.line) return { ok: false, error: 'append_log 需要 line' };
          md = planDoc.appendLog(md, args.line);
        } else if (args.op === 'replace_steps') {
          if (!Array.isArray(args.steps)) return { ok: false, error: 'replace_steps 需要 steps 数组' };
          const parsed = planDoc.parsePlanDoc(md);
          const normalized = args.steps.map((s, i) => ({
            id: s.id ?? `step-${i + 1}`,
            title: s.title,
            targetType: s.targetType,
            operation: s.operation,
            dependsOn: s.dependsOn ?? [],
            task: s.task,
            done: !!s.done,
            completedAt: s.completedAt ?? null,
          }));
          md = planDoc.renderPlanDoc({
            title: parsed.title,
            status: parsed.status,
            createdAt: new Date().toISOString(),
            intent: '',
            assumptions: [],
            steps: normalized,
            log: [],
          });
        } else {
          return { ok: false, error: `unknown op: ${args.op}` };
        }
        await planDoc.writePlanDoc(task.id, md);
        taskStore.emit(task.id, { type: 'plan_doc_updated', taskId: task.id, content: md });
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    },
  };

  const dispatchSubagent = {
    definition: {
      type: 'function',
      function: {
        name: 'dispatch_subagent',
        description: '派发子代理执行计划文档中某未完成的 step；返回 { ok, success, summary } 或 { ok:false, error }。',
        parameters: {
          type: 'object',
          properties: { stepId: { type: 'string' } },
          required: ['stepId'],
        },
      },
    },
    execute: async (args) => {
      try {
        const md = await planDoc.readPlanDoc(task.id);
        const parsed = planDoc.parsePlanDoc(md);
        const step = parsed.steps.find((s) => s.id === args.stepId);
        if (!step) return { ok: false, error: `step not found: ${args.stepId}` };
        if (step.done) return { ok: false, error: `step already done: ${args.stepId}` };
        taskStore.emit(task.id, { type: 'step_started', taskId: task.id, stepId: step.id, title: step.title });
        let outcome;
        try {
          const result = await dispatchSubAgent({
            stepId: step.id,
            targetType: step.targetType,
            operation: step.operation,
            entityRef: step.dependsOn[0] ?? null,
            task: step.task,
            context: task.context,
          });
          if (result?.success === false) {
            taskStore.emit(task.id, { type: 'step_failed', taskId: task.id, stepId: step.id, error: result.error ?? 'unknown' });
            outcome = { ok: true, success: false, error: result.error ?? 'unknown' };
          } else {
            taskStore.emit(task.id, { type: 'step_completed', taskId: task.id, stepId: step.id, result });
            outcome = { ok: true, success: true, summary: result?.summary ?? '' };
          }
        } catch (err) {
          taskStore.emit(task.id, { type: 'step_failed', taskId: task.id, stepId: step.id, error: err.message });
          outcome = { ok: false, error: err.message };
        }

        // 暂停语义闭环（spec §6.4）：step 终态写入后，检查 pendingUserMessages。
        // 有挂起消息 → 切 paused、emit、把消息追加到 task.messages，提示 LLM 停止后续 dispatch。
        const pending = taskStore.takeUserMessages(task.id);
        if (pending.length > 0) {
          taskStore.setStatus(task.id, 'paused');
          taskStore.emit(task.id, { type: 'paused', taskId: task.id });
          for (const m of pending) {
            taskStore.appendMessage(task.id, { role: 'user', content: m });
          }
          return { ...outcome, paused: true, pendingMessages: pending };
        }
        return outcome;
      } catch (err) {
        return { ok: false, error: err.message };
      }
    },
  };

  const deletePlanDocTool = {
    definition: {
      type: 'function',
      function: {
        name: 'delete_plan_doc',
        description: '删除计划文档（终态前调用）。',
        parameters: { type: 'object', properties: {} },
      },
    },
    execute: async () => {
      try {
        await planDoc.deletePlanDoc(task.id);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    },
  };

  const finalizeTask = {
    definition: {
      type: 'function',
      function: {
        name: 'finalize_task',
        description: '发送总结消息并把任务设为终态。terminalStatus ∈ {completed, failed, cancelled}。',
        parameters: {
          type: 'object',
          properties: {
            summary: { type: 'string' },
            terminalStatus: { type: 'string', enum: ['completed', 'failed', 'cancelled'] },
          },
          required: ['summary', 'terminalStatus'],
        },
      },
    },
    execute: async (args) => {
      try {
        taskStore.setStatus(task.id, args.terminalStatus);
        taskStore.appendMessage(task.id, { role: 'assistant', content: args.summary });
        const eventType = args.terminalStatus === 'completed'
          ? 'task_completed'
          : args.terminalStatus === 'failed'
            ? 'task_failed'
            : 'task_cancelled';
        taskStore.emit(task.id, { type: eventType, taskId: task.id, summary: args.summary });
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    },
  };

  return [writePlanDoc, editPlanDoc, dispatchSubagent, deletePlanDocTool, finalizeTask];
}

function buildContextBlock(task, planDocContent) {
  return [
    `# 任务上下文`,
    ``,
    `- status: ${task.status}`,
    `- worldId: ${task.context?.worldId ?? 'null'}`,
    `- characterId: ${task.context?.characterId ?? 'null'}`,
    ``,
    `# 当前计划文档`,
    ``,
    planDocContent ? planDocContent : '（尚未生成）',
  ].join('\n');
}

export async function runParentAgent(task, userInput, opts = {}) {
  if (!task) throw new Error('runParentAgent: task is required');

  // sentinel：/approve 触发执行循环
  const isApprovedSentinel = userInput === APPROVED_SENTINEL;
  const visibleUserInput = isApprovedSentinel
    ? '（系统）用户已确认计划，请按 plan doc 顺序派发未完成步骤。'
    : String(userInput ?? '');

  const stampedUser = taskStore.appendMessage(task.id, {
    id: opts.userMessageId,
    role: 'user',
    content: visibleUserInput,
  });
  if (stampedUser) {
    taskStore.emit(task.id, { type: 'user_message', taskId: task.id, messageId: stampedUser.id });
  }

  const systemPrompt = await loadSystemPrompt();
  const planDocContent = await planDoc.readPlanDoc(task.id).catch(() => '');
  const contextBlock = buildContextBlock(task, planDocContent);

  // 工具组装
  const previewTool = createPreviewCardTool({
    worldId: task.context?.worldId ?? null,
    characterId: task.context?.characterId ?? null,
    world: task.context?.world ?? null,
    character: task.context?.character ?? null,
  });

  const applyCtx = { worldRefId: task.context?.worldId ?? null };

  const tools = [
    toLLMTool(previewTool),
    toLLMTool(listResources),
    toLLMTool(READ_FILE_TOOL),
    ...Object.entries(APPLY_TOOLS).map(([, mod]) => toLLMTool(mod, wrapApply(mod, applyCtx))),
    ...buildMetaTools(task).map((t) => toLLMTool(t)),
  ];

  // 历史 + 当前轮上下文
  const messages = [
    { role: 'system', content: systemPrompt },
    ...task.messages.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: contextBlock },
  ];

  const config = getConfig();
  const configScope = config.assistant?.model_source === 'aux' ? 'aux' : 'main';

  log.info(`START  ${formatMeta({
    taskId: task.id,
    status: task.status,
    sentinel: isApprovedSentinel,
    msgs: task.messages.length,
    input: previewText(visibleUserInput, { limit: 120 }),
  })}`);

  let finalText = '';
  try {
    const raw = await llm.completeWithTools(messages, tools, {
      temperature: 0.3,
      thinking_level: null,
      configScope,
    });
    finalText = String(raw ?? '').trim();
    log.info(`DONE  ${formatMeta({ taskId: task.id, chars: finalText.length, status: task.status })}`);
  } catch (err) {
    log.error(`FAIL  ${formatMeta({ taskId: task.id, error: err.message })}`);
    taskStore.emit(task.id, { type: 'task_failed', taskId: task.id, error: err.message });
    taskStore.setStatus(task.id, 'failed');
    taskStore.emit(task.id, { type: 'done', done: true });
    throw err;
  }

  if (finalText) {
    const stamped = taskStore.appendMessage(task.id, { role: 'assistant', content: finalText });
    taskStore.emit(task.id, { type: 'delta', delta: finalText, messageId: stamped?.id });
  }
  taskStore.emit(task.id, { type: 'done', done: true });
}

export const __testables = {
  toLLMTool,
  wrapApply,
  buildContextBlock,
  buildMetaTools,
  loadSystemPrompt,
  APPROVED_SENTINEL,
};
