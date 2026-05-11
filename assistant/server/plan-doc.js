// assistant/server/plan-doc.js
import fs from 'node:fs/promises';
import path from 'node:path';

const PLAN_DIR = path.resolve(process.cwd(), '.temp/assistant');

export async function ensurePlanDir() {
  await fs.mkdir(PLAN_DIR, { recursive: true });
}

export function planDocPath(taskId) {
  return path.join(PLAN_DIR, `${taskId}.md`);
}

export function renderPlanDoc({ title, status, createdAt, intent, assumptions = [], steps = [], log = [] }) {
  const stepLines = steps.map((s) => {
    const checkbox = s.done ? '[x]' : '[ ]';
    const dep = s.dependsOn?.length ? s.dependsOn.join(', ') : '无';
    const done = s.done && s.completedAt ? `\n  - 完成于 ${s.completedAt}` : '';
    return `- ${checkbox} **${s.id}** ${s.title}（${s.targetType}.${s.operation}）\n  - 依赖：${dep}\n  - 任务：${s.task}${done}`;
  }).join('\n');
  const assumptionLines = assumptions.length ? assumptions.map((a) => `- ${a}`).join('\n') : '- 无';
  const logLines = log.length ? log.join('\n') : '';
  return `# 任务：${title}

> 状态：${status} · 创建时间：${createdAt}

## 用户意图
${intent}

## 假设与约束
${assumptionLines}

## 步骤

${stepLines}

## 执行日志
${logLines}
`;
}

const STEP_RE = /^- \[(x| )\] \*\*(step-\d+)\*\* (.+?)（([\w-]+)\.(create|update|delete)）$/;
const DEP_RE = /^  - 依赖：(.+)$/;
const TASK_RE = /^  - 任务：(.+)$/;
const COMPLETED_AT_RE = /^  - 完成于 (.+)$/;

export function parsePlanDoc(md) {
  const lines = md.split('\n');
  const titleMatch = lines[0]?.match(/^# 任务：(.+)$/);
  const title = titleMatch ? titleMatch[1] : '';
  const statusMatch = md.match(/状态：(\w+)/);
  const status = statusMatch ? statusMatch[1] : 'planning';
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
      cur.dependsOn = dm[1] === '无' ? [] : dm[1].split(',').map((x) => x.trim()).filter(Boolean);
      continue;
    }
    const tm = line.match(TASK_RE);
    if (tm) {
      cur.task = tm[1];
      continue;
    }
    const cm = line.match(COMPLETED_AT_RE);
    if (cm) cur.completedAt = cm[1];
  }
  return { title, status, steps };
}

export function pickNextStep(steps) {
  const doneIds = new Set(steps.filter((s) => s.done).map((s) => s.id));
  return steps.find((s) => !s.done && s.dependsOn.every((d) => doneIds.has(d))) ?? null;
}

export function markStepDone(md, stepId, completedAt) {
  const lines = md.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const m = lines[i].match(STEP_RE);
    if (m && m[2] === stepId) {
      out.push(lines[i].replace(/^- \[ \]/, '- [x]'));
      // 寻找该 step 的下一个非缩进-2 行作为插入完成时间的位置
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

export function appendLog(md, line) {
  return md.replace(/(## 执行日志\n)/, `$1${line}\n`);
}

export async function readPlanDoc(taskId) {
  return fs.readFile(planDocPath(taskId), 'utf8');
}

export async function writePlanDoc(taskId, content) {
  await ensurePlanDir();
  await fs.writeFile(planDocPath(taskId), content, 'utf8');
}

export async function deletePlanDoc(taskId) {
  await fs.unlink(planDocPath(taskId)).catch(() => {});
}
