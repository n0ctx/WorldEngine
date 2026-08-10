import {
  getAssistantTask,
  upsertAssistantTask,
} from '../../backend/db/queries/assistant-tasks.js';
import { setPlanDocContent, setPlanDocData } from './task-store.js';

export async function ensurePlanDir() {
  // 兼容旧调用方；计划文档现已完全持久化到 assistant_tasks.plan_doc_content。
}

export function planDocPath(taskId) {
  return `.temp/assistant/${taskId}.md`;
}

function normalizePlanDocText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(normalizePlanDocText).filter(Boolean).join('；');
  }
  if (typeof value === 'object') {
    const preferredKeys = [
      'text',
      'content',
      'fact',
      'assumption',
      'constraint',
      'description',
      'summary',
      'title',
      'name',
      'value',
    ];
    const parts = [];
    for (const key of preferredKeys) {
      const text = normalizePlanDocText(value[key]).trim();
      if (text) parts.push(text);
    }
    const source = normalizePlanDocText(value.source ?? value.from ?? value.ref).trim();
    if (source) parts.push(`来源：${source}`);
    if (parts.length) return [...new Set(parts)].join('；');
    return Object.entries(value)
      .map(([key, val]) => {
        const text = normalizePlanDocText(val).trim();
        return text ? `${key}: ${text}` : '';
      })
      .filter(Boolean)
      .join('；');
  }
  return String(value);
}

export function normalizePlanDocList(value) {
  const values = Array.isArray(value) ? value : [value];
  return values
    .map((item) => normalizePlanDocText(item).trim())
    .filter(Boolean);
}

export function renderPlanDoc({ title, status, createdAt, updatedAt, intent, assumptions = [], steps = [] }) {
  const stepLines = steps.map((s) => {
    const checkbox = s.done ? '[x]' : '[ ]';
    const dep = s.dependsOn?.length ? normalizePlanDocList(s.dependsOn).join(', ') : '无';
    const done = s.done && s.completedAt ? `\n  - 完成于 ${normalizePlanDocText(s.completedAt)}` : '';
    // 去掉模型可能在 title 里自带的 (targetType.operation) 或 （targetType.operation）后缀，避免重复
    const rawTitle = normalizePlanDocText(s.title).replace(/\s*[（(][\w-]+\.(create|update|delete)[)）]\s*$/i, '').trim();
    return `- ${checkbox} **${normalizePlanDocText(s.id)}** ${rawTitle}（${normalizePlanDocText(s.targetType)}.${normalizePlanDocText(s.operation)}）\n  - 依赖：${dep}\n  - 任务：${normalizePlanDocText(s.task)}${done}`;
  }).join('\n');
  const normalizedAssumptions = normalizePlanDocList(assumptions);
  const assumptionLines = normalizedAssumptions.length ? normalizedAssumptions.map((a) => `- ${a}`).join('\n') : '- 无';
  const timeLine = updatedAt
    ? `> 状态：${normalizePlanDocText(status)} · 创建时间：${normalizePlanDocText(createdAt)} · 更新时间：${normalizePlanDocText(updatedAt)}`
    : `> 状态：${normalizePlanDocText(status)} · 创建时间：${normalizePlanDocText(createdAt)}`;
  return `# 任务：${normalizePlanDocText(title)}

${timeLine}

## 用户意图
${normalizePlanDocText(intent)}

## 假设与约束
${assumptionLines}

## 步骤

${stepLines}
`;
}

export function pickNextStep(steps) {
  const doneIds = new Set(steps.filter((s) => s.done).map((s) => s.id));
  return steps.find((s) => !s.done && s.dependsOn.every((d) => doneIds.has(d))) ?? null;
}

/**
 * 校验结构化计划对象。返回 { valid: boolean, error?: string }
 */
export function validatePlan(plan) {
  if (!plan || typeof plan !== 'object') {
    return { valid: false, error: '计划文档为空' };
  }
  if (!plan.title || String(plan.title).trim() === '') {
    return { valid: false, error: '计划文档缺少标题' };
  }
  if (!Array.isArray(plan.steps) || plan.steps.length === 0) {
    return { valid: false, error: '计划文档缺少步骤' };
  }
  const stepIds = new Set();
  for (const s of plan.steps) {
    if (!s.id || !/^step-\d+$/.test(s.id)) {
      return { valid: false, error: `步骤 ID 格式非法: ${s.id ?? '(空)'}` };
    }
    if (stepIds.has(s.id)) {
      return { valid: false, error: `步骤 ID 重复: ${s.id}` };
    }
    stepIds.add(s.id);
    if (!s.title || String(s.title).trim() === '') {
      return { valid: false, error: `${s.id} 缺少标题` };
    }
    if (!s.targetType) {
      return { valid: false, error: `${s.id} 缺少 targetType` };
    }
    if (!s.operation) {
      return { valid: false, error: `${s.id} 缺少 operation` };
    }
    if (!s.task || String(s.task).trim() === '') {
      return { valid: false, error: `${s.id} 缺少 task 说明` };
    }
  }
  return { valid: true };
}

/**
 * 结构级操作：把 plan.steps 中对应 stepId 的 done 置 true、completedAt 写上，返回新的 plan 对象。
 * 不做任何 md 字符串手术——md 完全由 renderPlanDoc(plan) 派生，结构性地不可能与 plan 不同步。
 */
export function markStepDone(plan, stepId, completedAt) {
  const steps = (plan?.steps ?? []).map((s) =>
    s.id === stepId ? { ...s, done: true, completedAt } : s,
  );
  return { ...plan, steps };
}

function getPersistedTask(taskId) {
  return getAssistantTask(taskId);
}

function upsertPlanDocument(taskId, md, plan) {
  const task = getPersistedTask(taskId);
  if (!task) throw new Error(`task not found: ${taskId}`);
  upsertAssistantTask({
    ...task,
    planDocContent: typeof md === 'string' ? md : '',
    planDocData: plan ?? null,
    updatedAt: Date.now(),
  });
}

export async function readPlanDoc(taskId) {
  return getPersistedTask(taskId)?.planDocContent ?? '';
}

/** 返回结构化计划对象（真源），没有则返回 null；不做 md 反解析兜底。 */
export async function readPlanData(taskId) {
  return getPersistedTask(taskId)?.planDocData ?? null;
}

/**
 * plan 是结构化对象 { title, status, createdAt, updatedAt, intent, assumptions, steps }。
 * 内部用 renderPlanDoc(plan) 派生 md，md 与结构同时落库（DB + task-store 内存镜像），
 * 调用方不需要（也不应该）分别传 md 和 plan。
 */
export async function writePlanDoc(taskId, plan) {
  const md = renderPlanDoc(plan);
  upsertPlanDocument(taskId, md, plan);
  setPlanDocContent(taskId, md);
  setPlanDocData(taskId, plan);
}

export async function deletePlanDoc(taskId) {
  const task = getPersistedTask(taskId);
  if (!task) return;
  upsertAssistantTask({
    ...task,
    planDocContent: '',
    planDocData: null,
    updatedAt: Date.now(),
  });
  setPlanDocContent(taskId, '');
  setPlanDocData(taskId, null);
}
