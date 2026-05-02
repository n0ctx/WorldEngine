import { randomUUID } from 'node:crypto';
import * as llm from '../../backend/llm/index.js';
import { getConfig } from '../../backend/services/config.js';
import { createLogger, formatMeta, previewText } from '../../backend/utils/logger.js';
import { extractJson } from './tools/extract-json.js';

const log = createLogger('as-plan', 'magenta');
const PLAN_RETRY_MAX = 3;
const VALID_TARGET_TYPES = new Set(['world-card', 'character-card', 'persona-card', 'global-config', 'css-snippet', 'regex-rule']);
const VALID_OPERATIONS = {
  'world-card': new Set(['create', 'update', 'delete']),
  'character-card': new Set(['create', 'update', 'delete']),
  'persona-card': new Set(['create', 'update']),
  'global-config': new Set(['update']),
  'css-snippet': new Set(['create', 'update', 'delete']),
  'regex-rule': new Set(['create', 'update', 'delete']),
};
const VALID_RISK_LEVELS = new Set(['low', 'medium', 'high']);
const HIGH_RISK_TASK_RE = /删除|清空|覆盖|重置|销毁/;

function summarizeResearchForPrompt(research) {
  if (!research || typeof research !== 'object') return '无';
  const lines = [];
  if (research.summary) lines.push(`探索摘要：${research.summary}`);
  if (Array.isArray(research.findings) && research.findings.length > 0) {
    lines.push('已确认事实：');
    for (const item of research.findings.slice(0, 12)) {
      lines.push(`- ${item}`);
    }
  }
  if (Array.isArray(research.constraints) && research.constraints.length > 0) {
    lines.push('执行约束：');
    for (const item of research.constraints.slice(0, 8)) {
      lines.push(`- ${item}`);
    }
  }
  if (Array.isArray(research.gaps) && research.gaps.length > 0) {
    lines.push('仍缺信息：');
    for (const item of research.gaps.slice(0, 6)) {
      lines.push(`- ${item}`);
    }
  }
  return lines.join('\n') || '无';
}

function buildPlannerPrompt({ message, history, context, research = null, retryFeedback = [] }) {
  const world = context?.world;
  const character = context?.character;
  const cfg = context?.config;
  const compactHistory = Array.isArray(history)
    ? history.slice(-8).map((item) => `${item.role}: ${String(item.content ?? '').slice(0, 180)}`).join('\n')
    : '';
  const retryHint = retryFeedback.length > 0
    ? `\n上一次输出未通过校验，必须修正以下问题后重写完整 JSON：\n- ${retryFeedback.join('\n- ')}\n`
    : '';

  return [
    {
      role: 'system',
      content:
        '你是 WorldEngine 写卡助手的任务规划器。' +
        '你的输出必须是 1 个 JSON 对象，不要代码块，不要解释。' +
        '如果原始需求是在提问、咨询或讨论概念，而不是要求执行变更，请输出 mode="answer" 并给出 answer。' +
        '如果原始需求要求执行改动，请优先输出 mode="plan"，用 assumptions 数组记录你的推断；' +
        '只有当缺少"必须由使用者提供、无法合理推断"的信息（如：update/delete 操作但上下文完全没有目标实体）时，才输出 mode="clarify"，且 clarificationQuestions 只问 1 个最关键的问题。' +
        '以下情况绝对不要 clarify，直接 plan：题材/风格/名字不明确（给合理默认值）、原始需求说"随便""帮我设计"等模糊指令、细节不完整但方向明确。' +
        '如果原始需求要求执行改动，请输出 mode="plan"，并生成一个可执行的通用步骤计划。' +
        '你必须基于“探索结果”制定计划；不要假装知道探索结果中没有出现的现有字段、条目或实体。' +
        '规划前先在内部判断任务类型：单资源小改、复杂世界卡、状态机世界卡、多资源创建、修复已有卡；不要输出分类，只按分类选择步骤模板。' +
        '复杂世界卡或状态机世界卡必须优先拆步，而不是让一个 world-card 步骤同时承担全部设定、字段、触发条目和初始状态。' +
        '计划中的每个 step 只能交给一个资源域代理：world-card / character-card / persona-card / global-config / css-snippet / regex-rule。' +
        '每个 step 的 operation 只能是 create / update / delete 之一（world-card 允许 create/update/delete；persona-card 只允许 create/update；global-config 只允许 update）；preview / read / query / view 绝对不是合法的 operation；若任务只是查看或说明卡片内容，必须改为 mode="answer" 而不是生成一个 plan step。' +
        'step 字段固定包含：id、title、targetType、operation、entityRef、dependsOn、task、riskLevel、rationale、inputs、expectedOutput、acceptance、rollbackRisk。' +
        'entityRef 使用 null、"context.worldId"、"context.characterId" 或 "step:<stepId>"。' +
        'dependsOn 必须是已出现 step.id 数组；若 entityRef 使用 step:<stepId>，该 stepId 必须同时出现在 dependsOn。' +
        'character-card create 与 persona-card create 必须显式依赖一个世界实体来源：context.worldId 或前置 world-card create 步骤。' +
        '所有 update/delete 步骤都必须带可解析 entityRef。' +
        'delete / 清空 / 覆盖 / 重置类高风险步骤必须标记 riskLevel="high"。' +
        '若是从零创建完整世界，可拆成 world-card create、persona-card create、多个 character-card create；' +
        '若 world-card create 同时涉及 10 个以上状态字段或 5 条以上 entryOps，必须拆成 2 个 world-card 步骤：Step 1 创建基础结构（always 条目 + 核心状态字段），Step 2 用 update 追加 state/keyword/llm 条目和剩余字段；两步不要重叠字段；world-card 不支持 stateValueOps，初始状态值须通过后续 persona-card 或 character-card 步骤的 stateValueOps 填写。' +
        '状态机世界卡的推荐模板：Step 1 定义阶段 enum 字段和核心 always 条目；Step 2 为每个阶段创建对应 state 条目，conditions 全部引用同一个阶段字段；Step 3 如需初始数值，再由 persona-card 或 character-card 填写 stateValueOps。' +
        '修复已有卡的推荐模板：先让对应卡代理读取 preview_card，再只修复无效触发、字段类型、条件引用或遗漏内容，不重写整张卡。' +
        '若是已有实体修改，必须基于上下文已有 worldId/characterId 或让后续步骤引用上一步产物。' +
        '【字段定义 vs 字段值】修改世界卡中的状态字段定义（player_fields / character_fields 的字段结构、类型、枚举值等）属于 world-card 域操作，不要拆成 character-card 步骤。character-card update 只用于修改具体角色实例的属性或状态值，且必须有可解析的 context.characterId 或 step 引用；若上下文没有角色，禁止生成 entityRef="context.characterId" 的 character-card 步骤。' +
        '高风险步骤 riskLevel 取 high，其余取 low 或 medium。' +
        'rationale 写为什么需要此步骤；inputs 写会用到的上下文或前序 step 产物；expectedOutput 写本步骤应产出的 proposal 类型和关键内容；acceptance 写 1-3 条可检查验收点；rollbackRisk 写失败或误操作影响，低风险也要写“低”。' +
        'CUD 规划术语必须统一：写入 step.title、step.task、assumptions、summary 时，代入者统一写 {{user}}，模型扮演或回应的角色统一写 {{char}}；不要混写“用户”“玩家”“AI”“NPC”等称呼。接口字段名和枚举值（如 persona-card、character-card、user_input、ai_output）按 schema 保持不变。' +
        '输出 schema：{"mode":"answer|clarify|plan","summary":"","answer":"","clarificationQuestions":[],"assumptions":[],"steps":[]}',
    },
    {
      role: 'user',
      content:
        `原始需求：${message}\n\n` +
        `当前世界：${world ? `${world.name} (${world.id})` : '无'}\n` +
        `当前角色：${character ? `${character.name} (${character.id})` : '无'}\n` +
        `当前模型：${cfg?.llm?.model || '未知'}\n\n` +
        `探索结果：\n${summarizeResearchForPrompt(research)}\n\n` +
        `最近历史：\n${compactHistory || '无'}${retryHint}`,
    },
  ];
}

function normalizeQuestions(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => String(item ?? '').trim()).filter(Boolean).slice(0, 3);
}

function normalizeSteps(rawSteps, context = {}) {
  if (!Array.isArray(rawSteps)) return [];
  const contextWorldId = context?.worldId || context?.world?.id || null;

  // 找计划内的 world-card create 步骤（用 filter 后的下标计算 normalized id，与后续 map 保持一致）
  const filtered = rawSteps.filter((step) => step && typeof step === 'object');
  const worldCreateStepId = (() => {
    for (let i = 0; i < filtered.length; i++) {
      const s = filtered[i];
      if (
        (typeof s.targetType === 'string' ? s.targetType.trim() : '') === 'world-card' &&
        (typeof s.operation === 'string' ? s.operation.trim() : '') === 'create'
      ) {
        return typeof s.id === 'string' && s.id.trim() ? s.id.trim() : `step-${i + 1}`;
      }
    }
    return null;
  })();

  return filtered
    .map((step, index) => {
      const targetType = typeof step.targetType === 'string' ? step.targetType.trim() : '';
      const operation = typeof step.operation === 'string' ? step.operation.trim() : 'update';
      const rawEntityRef = typeof step.entityRef === 'string' && step.entityRef.trim() ? step.entityRef.trim() : null;
      let entityRef = rawEntityRef;
      if ((targetType === 'character-card' || targetType === 'persona-card') && operation === 'create' && !rawEntityRef) {
        if (worldCreateStepId) {
          // 计划内有 world-card create 步骤时优先引用其产物，不能使用旧的 context.worldId
          entityRef = `step:${worldCreateStepId}`;
        } else if (contextWorldId) {
          entityRef = 'context.worldId';
        }
      }
      const riskLevel = typeof step.riskLevel === 'string' ? step.riskLevel.trim() : 'low';
      const rawDependsOn = Array.isArray(step.dependsOn) ? step.dependsOn.map((item) => String(item ?? '').trim()).filter(Boolean) : [];
      // 若 entityRef 自动补填为 step:X，确保 dependsOn 包含该 stepId
      if (entityRef && entityRef.startsWith('step:')) {
        const refId = entityRef.slice(5);
        if (refId && !rawDependsOn.includes(refId)) rawDependsOn.push(refId);
      }
      return {
        id: typeof step.id === 'string' && step.id.trim() ? step.id.trim() : `step-${index + 1}`,
        title: typeof step.title === 'string' && step.title.trim() ? step.title.trim() : `步骤 ${index + 1}`,
        kind: 'proposal',
        targetType,
        operation,
        entityRef,
        dependsOn: rawDependsOn,
        task: typeof step.task === 'string' ? step.task.trim() : '',
        riskLevel,
        approvalPolicy: riskLevel === 'high' ? 'requires_step_approval' : 'plan_only',
        rationale: typeof step.rationale === 'string' && step.rationale.trim() ? step.rationale.trim() : '按计划拆分执行',
        inputs: Array.isArray(step.inputs) ? step.inputs.map((item) => String(item ?? '').trim()).filter(Boolean) : [],
        expectedOutput: typeof step.expectedOutput === 'string' && step.expectedOutput.trim()
          ? step.expectedOutput.trim()
          : `${targetType} ${operation} proposal`,
        acceptance: Array.isArray(step.acceptance)
          ? step.acceptance.map((item) => String(item ?? '').trim()).filter(Boolean).slice(0, 3)
          : [],
        rollbackRisk: typeof step.rollbackRisk === 'string' && step.rollbackRisk.trim() ? step.rollbackRisk.trim() : '低',
        status: 'pending',
        proposal: null,
        result: null,
        error: null,
      };
    })
    .filter((step) => step.targetType && step.operation && step.task);
}

function inferAnswer(message) {
  return `我先把这个需求视为说明性问题：${message}`;
}

function parsePlannerJson(raw, message) {
  try {
    return extractJson(raw);
  } catch (err) {
    return {
      error: `输出不是合法 JSON（${err.message}）`,
      fallback: { mode: 'answer', summary: '规划器输出非法 JSON，回退直接答复', answer: inferAnswer(message) },
    };
  }
}

function validatePlanSteps(rawSteps, context = {}) {
  if (!Array.isArray(rawSteps) || rawSteps.length === 0) {
    return ['steps 必须是至少包含 1 个步骤的数组'];
  }
  const errors = [];
  const steps = rawSteps
    .filter((step) => step && typeof step === 'object')
    .map((step, index) => ({
      index,
      id: typeof step.id === 'string' && step.id.trim() ? step.id.trim() : `step-${index + 1}`,
      targetType: typeof step.targetType === 'string' ? step.targetType.trim() : '',
      operation: typeof step.operation === 'string' ? step.operation.trim() : '',
      entityRef: typeof step.entityRef === 'string' && step.entityRef.trim() ? step.entityRef.trim() : null,
      dependsOn: Array.isArray(step.dependsOn) ? step.dependsOn.map((item) => String(item ?? '').trim()).filter(Boolean) : [],
      task: typeof step.task === 'string' ? step.task.trim() : '',
      riskLevel: typeof step.riskLevel === 'string' ? step.riskLevel.trim() : '',
    }));
  const ids = new Set();
  const stepMap = new Map();

  for (const step of steps) {
    if (ids.has(step.id)) {
      errors.push(`steps[${step.index}] 的 id "${step.id}" 重复`);
      continue;
    }
    ids.add(step.id);
    stepMap.set(step.id, step);
  }

  for (const step of steps) {
    if (!VALID_TARGET_TYPES.has(step.targetType)) {
      errors.push(`steps[${step.index}].targetType 非法：${step.targetType || '(空)'}`);
    }
    if (!VALID_OPERATIONS[step.targetType]?.has(step.operation)) {
      const allowed = VALID_OPERATIONS[step.targetType] ? [...VALID_OPERATIONS[step.targetType]].join(', ') : '（targetType 非法）';
      errors.push(`steps[${step.index}].operation "${step.operation || '(空)'}" 不在 ${step.targetType || '(空)'} 允许的操作内（允许：${allowed}）；preview/read/query 不是合法 operation，若只是查看卡片请改为 mode="answer"`);
    }
    if (!step.task) {
      errors.push(`steps[${step.index}].task 不能为空`);
    }
    if (!VALID_RISK_LEVELS.has(step.riskLevel)) {
      errors.push(`steps[${step.index}].riskLevel 非法：${step.riskLevel || '(空)'}`);
    }
    if (!Array.isArray(step.dependsOn)) {
      errors.push(`steps[${step.index}].dependsOn 必须是数组`);
    }
    for (const depId of step.dependsOn) {
      if (!stepMap.has(depId)) {
        errors.push(`steps[${step.index}].dependsOn 引用了不存在的 step：${depId}`);
      }
      if (depId === step.id) {
        errors.push(`steps[${step.index}].dependsOn 不能依赖自己`);
      }
    }

    if (step.entityRef === 'context.worldId' && !context?.worldId && !context?.world?.id) {
      errors.push(`steps[${step.index}].entityRef 使用了 context.worldId，但当前上下文没有 worldId`);
    }
    if (step.entityRef === 'context.characterId' && !context?.characterId && !context?.character?.id) {
      errors.push(`steps[${step.index}].entityRef 使用了 context.characterId，但当前上下文没有 characterId`);
    }
    if (step.entityRef && step.entityRef.startsWith('step:')) {
      const refStepId = step.entityRef.slice(5);
      const refStep = stepMap.get(refStepId);
      if (!refStep) {
        errors.push(`steps[${step.index}].entityRef 引用了不存在的 step：${refStepId}`);
      } else {
        if (!step.dependsOn.includes(refStepId)) {
          errors.push(`steps[${step.index}] 使用 step:${refStepId} 作为 entityRef 时，dependsOn 必须包含该 stepId`);
        }
        if (refStep.operation !== 'create') {
          errors.push(`steps[${step.index}] 的 entityRef=step:${refStepId} 必须引用 create 步骤`);
        }
      }
    }

    if (step.operation !== 'create' && !step.entityRef) {
      errors.push(`steps[${step.index}] 的 ${step.operation} 步骤必须提供 entityRef`);
    }

    if (step.targetType === 'world-card' && step.operation === 'create' && step.entityRef) {
      errors.push(`steps[${step.index}] 的 world-card create 不应提供 entityRef`);
    }

    if ((step.targetType === 'character-card' || step.targetType === 'persona-card') && step.operation === 'create') {
      if (!step.entityRef) {
        const hasContextWorld = !!(context?.worldId || context?.world?.id);
        const hasWorldCreateStep = steps.some((s) => s.targetType === 'world-card' && s.operation === 'create');
        if (!hasContextWorld && !hasWorldCreateStep) {
          errors.push(
            `steps[${step.index}] 的 ${step.targetType} create 缺少世界来源：请先添加 world-card create 步骤，再通过 entityRef="step:<world-step-id>" 引用其产物`,
          );
        }
        // hasContextWorld 或 hasWorldCreateStep 时 normalizeSteps 会自动补填，无需报错
      } else if (step.entityRef === 'context.characterId') {
        errors.push(`steps[${step.index}] 的 ${step.targetType} create 不能把 context.characterId 作为实体来源`);
      } else if (step.entityRef.startsWith('step:')) {
        const refStep = stepMap.get(step.entityRef.slice(5));
        if (refStep && refStep.targetType !== 'world-card') {
          errors.push(`steps[${step.index}] 的 ${step.targetType} create 只能引用 world-card create 结果作为 step entityRef`);
        }
      }
    }

    const requiresHighRisk = step.operation === 'delete' || HIGH_RISK_TASK_RE.test(step.task);
    if (requiresHighRisk && step.riskLevel !== 'high') {
      errors.push(`steps[${step.index}] 是高风险操作，riskLevel 必须为 high`);
    }
  }

  return errors;
}

export async function planTask({ message, history = [], context = {}, research = null }) {
  let retryFeedback = [];
  log.info(`PLAN START  ${formatMeta({ message: previewText(message, { limit: 160 }) })}`);
  const config = getConfig();
  const configScope = config.assistant?.model_source === 'aux' ? 'aux' : 'main';

  for (let attempt = 1; attempt <= PLAN_RETRY_MAX; attempt += 1) {
    const prompt = buildPlannerPrompt({ message, history, context, research, retryFeedback });
    const raw = await llm.complete(prompt, { temperature: 0.2, thinking_level: null, configScope });
    const parsedResult = parsePlannerJson(raw, message);
    if (parsedResult.error) {
      retryFeedback = [parsedResult.error];
      if (attempt === PLAN_RETRY_MAX) return parsedResult.fallback;
      continue;
    }

    const parsed = parsedResult;
    const mode = typeof parsed.mode === 'string' ? parsed.mode.trim() : 'answer';
    if (mode === 'clarify') {
      const questions = normalizeQuestions(parsed.clarificationQuestions);
      if (questions.length === 0) {
        retryFeedback = ['mode=clarify 时 clarificationQuestions 必须包含 1-3 个问题'];
        if (attempt < PLAN_RETRY_MAX) continue;
      }
      return {
        kind: 'clarify',
        summary: typeof parsed.summary === 'string' && parsed.summary.trim() ? parsed.summary.trim() : '需要补充关键信息后再规划',
        clarificationQuestions: questions,
      };
    }

    if (mode === 'plan') {
      const validationErrors = validatePlanSteps(parsed.steps, context);
      if (validationErrors.length > 0) {
        retryFeedback = validationErrors;
        log.warn(`PLAN RETRY  ${formatMeta({ attempt, reason: validationErrors[0] })}`);
        if (attempt < PLAN_RETRY_MAX) continue;
        throw new Error(`规划器输出连续 ${PLAN_RETRY_MAX} 次未通过校验：${validationErrors.join('；')}`);
      }
      const steps = normalizeSteps(parsed.steps, context);
      return {
        kind: 'plan',
        summary: typeof parsed.summary === 'string' && parsed.summary.trim() ? parsed.summary.trim() : '已生成执行计划',
        assumptions: Array.isArray(parsed.assumptions)
          ? parsed.assumptions.map((item) => String(item ?? '').trim()).filter(Boolean)
          : [],
        steps,
      };
    }

    return {
      kind: 'answer',
      summary: typeof parsed.summary === 'string' && parsed.summary.trim() ? parsed.summary.trim() : '直接答复',
      answer: typeof parsed.answer === 'string' && parsed.answer.trim() ? parsed.answer.trim() : inferAnswer(message),
    };
  }

  throw new Error('规划器重试失败');
}

export function createBaseTask({ message, context }) {
  return {
    id: `task-${randomUUID().slice(0, 8)}`,
    goal: message,
    status: 'researching',
    context: {
      worldId: context?.worldId ?? context?.world?.id ?? null,
      characterId: context?.characterId ?? context?.character?.id ?? null,
    },
    clarifications: [],
    plan: null,
    graph: [],
    artifacts: {},
    executionLog: [],
    riskFlags: [],
    error: null,
  };
}

export const __testables = {
  buildPlannerPrompt,
  summarizeResearchForPrompt,
  validatePlanSteps,
};
