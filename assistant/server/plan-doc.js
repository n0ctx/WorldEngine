import {
  getAssistantTask,
  upsertAssistantTask,
} from '../../backend/db/queries/assistant-tasks.js';
import { setPlanDocContent } from './task-store.js';

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
    return `- ${checkbox} **${normalizePlanDocText(s.id)}** ${normalizePlanDocText(s.title)}（${normalizePlanDocText(s.targetType)}.${normalizePlanDocText(s.operation)}）\n  - 依赖：${dep}\n  - 任务：${normalizePlanDocText(s.task)}${done}`;
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

// STEP_RE 容错：兼容全角/半角括号、行首/分隔位置多余空格；步骤行匹配不到时单步降级而非整份失败。
const STEP_RE = /^\s*-\s*\[\s*([ x])\s*\]\s*\*\*(step-\d+)\*\*\s*(.+?)\s*[（(]\s*([\w-]+)\s*\.\s*(create|update|delete)\s*[)）]\s*$/;
const DEP_RE = /^\s+-\s*依赖：(.+)$/;
const TASK_RE = /^\s+-\s*任务：(.+)$/;
const COMPLETED_AT_RE = /^\s+-\s*完成于\s*(.+)$/;

function extractSection(md, startHeader, endHeaderRe) {
  const startIdx = md.indexOf(startHeader);
  if (startIdx < 0) return '';
  const after = md.slice(startIdx + startHeader.length);
  const endMatch = after.match(endHeaderRe);
  const sectionRaw = endMatch ? after.slice(0, endMatch.index) : after;
  return sectionRaw.replace(/^\s+|\s+$/g, '');
}

export function parsePlanDoc(md) {
  const lines = md.split('\n');
  const titleMatch = lines[0]?.match(/^# 任务：(.+)$/);
  const title = titleMatch ? titleMatch[1].trim() : '';
  const statusMatch = md.match(/状态：\s*(\w+)/);
  const status = statusMatch ? statusMatch[1] : 'planning';
  const createdAtMatch = md.match(/创建时间：\s*([^·\n]+?)\s*(?:·|$|\n)/);
  const createdAt = createdAtMatch ? createdAtMatch[1].trim() : '';
  const updatedAtMatch = md.match(/更新时间：\s*([^·\n]+?)\s*(?:·|$|\n)/);
  const updatedAt = updatedAtMatch ? updatedAtMatch[1].trim() : '';

  const intent = extractSection(md, '## 用户意图', /^##\s/m);
  const assumptionsRaw = extractSection(md, '## 假设与约束', /^##\s/m);
  const assumptions = assumptionsRaw
    .split('\n')
    .map((line) => line.replace(/^\s*-\s*/, '').trim())
    .filter((line) => line && line !== '无');

  const steps = [];
  let cur = null;
  for (const line of lines) {
    const m = line.match(STEP_RE);
    if (m) {
      cur = { id: m[2], done: m[1] === 'x', title: m[3], targetType: m[4], operation: m[5], dependsOn: [], task: '', completedAt: null };
      steps.push(cur);
      continue;
    }
    if (!cur) continue;
    const dm = line.match(DEP_RE);
    if (dm) {
      cur.dependsOn = dm[1].trim() === '无' ? [] : dm[1].split(',').map((x) => x.trim()).filter(Boolean);
      continue;
    }
    const tm = line.match(TASK_RE);
    if (tm) {
      cur.task = tm[1].trim();
      continue;
    }
    const cm = line.match(COMPLETED_AT_RE);
    if (cm) cur.completedAt = cm[1].trim();
  }
  return { title, status, createdAt, updatedAt, intent, assumptions, steps };
}

export function pickNextStep(steps) {
  const doneIds = new Set(steps.filter((s) => s.done).map((s) => s.id));
  return steps.find((s) => !s.done && s.dependsOn.every((d) => doneIds.has(d))) ?? null;
}

/**
 * 校验计划文档 Markdown 是否能被正确解析。
 * 返回 { valid: boolean, error?: string }
 */
export function validatePlanDoc(md) {
  if (typeof md !== 'string' || !md.trim()) {
    return { valid: false, error: '计划文档为空' };
  }
  const parsed = parsePlanDoc(md);
  if (!parsed.title || parsed.title.trim() === '') {
    return { valid: false, error: '计划文档缺少标题' };
  }
  if (!Array.isArray(parsed.steps) || parsed.steps.length === 0) {
    return { valid: false, error: '计划文档缺少步骤' };
  }
  const stepIds = new Set();
  for (const s of parsed.steps) {
    if (!s.id || !/^step-\d+$/.test(s.id)) {
      return { valid: false, error: `步骤 ID 格式非法: ${s.id ?? '(空)'}` };
    }
    if (stepIds.has(s.id)) {
      return { valid: false, error: `步骤 ID 重复: ${s.id}` };
    }
    stepIds.add(s.id);
    if (!s.title || s.title.trim() === '') {
      return { valid: false, error: `${s.id} 缺少标题` };
    }
    if (!s.targetType) {
      return { valid: false, error: `${s.id} 缺少 targetType` };
    }
    if (!s.operation) {
      return { valid: false, error: `${s.id} 缺少 operation` };
    }
    if (!s.task || s.task.trim() === '') {
      return { valid: false, error: `${s.id} 缺少 task 说明` };
    }
  }
  return { valid: true };
}

export function markStepDone(md, stepId, completedAt) {
  const lines = md.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const m = lines[i].match(STEP_RE);
    if (m && m[2] === stepId) {
      out.push(lines[i].replace(/^(\s*-\s*)\[\s*\]/, '$1[x]'));
      let j = i + 1;
      const block = [];
      while (j < lines.length && lines[j].startsWith('  - ')) {
        block.push(lines[j]);
        j += 1;
      }
      out.push(...block);
      out.push(`  - 完成于 ${completedAt}`);
      i = j - 1;
    } else {
      out.push(lines[i]);
    }
  }
  return out.join('\n');
}

function getPersistedTask(taskId) {
  return getAssistantTask(taskId);
}

function upsertPlanDocContent(taskId, content) {
  const task = getPersistedTask(taskId);
  if (!task) throw new Error(`task not found: ${taskId}`);
  upsertAssistantTask({
    ...task,
    planDocContent: typeof content === 'string' ? content : '',
    updatedAt: Date.now(),
  });
}

export async function readPlanDoc(taskId) {
  return getPersistedTask(taskId)?.planDocContent ?? '';
}

export async function writePlanDoc(taskId, content) {
  upsertPlanDocContent(taskId, content);
  setPlanDocContent(taskId, content);
}

export async function deletePlanDoc(taskId) {
  const task = getPersistedTask(taskId);
  if (!task) return;
  upsertAssistantTask({
    ...task,
    planDocContent: '',
    updatedAt: Date.now(),
  });
  setPlanDocContent(taskId, '');
}
