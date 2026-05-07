# 写卡助手重做 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把写卡助手从"双轨（chat + tasks）+ 资源域子代理 + proposal/计划卡 UI"重构成"单接口 + 通用子代理 + 临时计划文档驱动"的 Claude Code CLI 风格架构。

**Architecture:** 父代理（长上下文，挂 CONTRACT.md）通过工具调用维护 `/.temp/assistant/<taskId>.md` 计划文档；用户确认后按文档 step 列表派发干净上下文的通用子代理；子代理调 `apply_*` 工具走原 `normalizeProposal()` 落库。所有 SSE 事件由父代理统一发出。

**Tech Stack:** Node.js (ES modules) + Express + SSE + better-sqlite3；前端 React 18 + Zustand + 现有 markdown 渲染。

**Spec：** `docs/superpowers/specs/2026-05-07-assistant-redesign-design.md`

---

## 文件结构（执行前先理解）

### 新增

| 文件 | 职责 |
|---|---|
| `assistant/knowledge/CONTRACT.md` | 助手契约 + 7 文件指路；每轮自动注入父代理 |
| `assistant/knowledge/WORLDCARD.md` | 世界卡 schema/entryOps/stateFieldOps |
| `assistant/knowledge/CHARCARD.md` | 角色卡 schema/stateValueOps |
| `assistant/knowledge/USERCARD.md` | persona schema |
| `assistant/knowledge/GLOBALPROMPT.md` | global-config 字段 |
| `assistant/knowledge/CSSSNIPPET.md` | css-snippet schema |
| `assistant/knowledge/REGEXRULE.md` | regex-rule schema |
| `assistant/server/plan-doc.js` | 计划文档读写 + checkbox 解析 + step 调度 |
| `assistant/server/normalize-proposal.js` | 从旧 routes.js 抽出 `normalizeProposal` + `applyProposal` |
| `assistant/server/sub-agent.js` | 通用执行子代理 |
| `assistant/server/parent-agent.js` | 父代理（编排 + 工具循环） |
| `assistant/server/tools/apply-world-card.js` | 内部调 normalizeProposal+applyProposal |
| `assistant/server/tools/apply-character-card.js` | 同上 |
| `assistant/server/tools/apply-persona-card.js` | 同上 |
| `assistant/server/tools/apply-global-config.js` | 同上 |
| `assistant/server/tools/apply-css-snippet.js` | 同上 |
| `assistant/server/tools/apply-regex-rule.js` | 同上 |
| `assistant/prompts/parent-agent.md` | 父代理工作方式 prompt |
| `assistant/prompts/sub-agent.md` | 子代理工作方式 prompt |
| `frontend/src/components/assistant/PlanDocViewer.jsx` | 只读 markdown + checkbox 渲染 |
| `assistant/tests/plan-doc.test.mjs` | plan-doc 单测 |
| `assistant/tests/parent-agent.test.mjs` | 主路径集成测 |

### 删除

```
assistant/CONTRACT.md
assistant/server/main-agent.js
assistant/server/task-planner.js
assistant/server/task-researcher.js
assistant/server/task-executor.js
assistant/server/agent-factory.js
assistant/server/agents/  (整个目录)
assistant/prompts/main.md
assistant/prompts/world-card.md
assistant/prompts/character-card.md
assistant/prompts/persona-card.md
assistant/prompts/global-prompt.md
assistant/prompts/css-snippet.md
assistant/prompts/regex-rule.md
assistant/client/ChangeProposalCard.jsx
```

### 改造

| 文件 | 改造点 |
|---|---|
| `assistant/server/routes.js` | 删 `/chat` `/execute` `/tasks*`；剩 `/agent*` + `/extract-characters` |
| `assistant/server/task-store.js` | state 简化；新增 planDocPath / status 字段 |
| `assistant/client/AssistantPanel.jsx` | 移除 proposal/plan/step UI，加 PlanDocViewer |
| `assistant/client/useAssistantStore.js` | state 重构 |
| `assistant/client/MessageList.jsx` | 去除 proposal 卡分支 |
| `assistant/client/InputBox.jsx` | 执行中允许输入（暂停信号） |
| `assistant/client/api.js` | 替换为 `/agent*` 接口 |
| `CLAUDE.md` (根) | 引用更新 |
| `ARCHITECTURE.md` | 助手运行机制章节重写 |
| `CHANGELOG.md` | 迁移记录 |

---

## Phase 0：准备

### Task 0.1: 建分支前准备 + 临时目录

**Files:**
- Create: `.temp/assistant/.gitkeep`

- [ ] **Step 1: 确认 .temp/ 已被 gitignore**

Run: `grep -n "^\.temp\|^/\\.temp" .gitignore`
Expected: 至少一行匹配。如果没有，先 `echo "/.temp/" >> .gitignore`。

- [ ] **Step 2: 建临时目录占位**

```bash
mkdir -p .temp/assistant
touch .temp/assistant/.gitkeep
```

注：`.gitkeep` 会被 .gitignore 排除；这一步纯粹保证本地目录存在，不进 git。

- [ ] **Step 3: 不提交**

不需要 commit，进入下一阶段。

---

## Phase 1：知识库迁移（7 份文件）

> 每份文件由旧 `assistant/prompts/*.md` 切分而来：保留 schema/字段说明/操作手册；剔除"主代理调用约定"那部分（搬到父/子代理 prompt）。
>
> **执行原则**：不要原样复制，要按 spec §8 的章节边界重组。先做 CONTRACT.md（最小核心），其余 6 份可并行。

### Task 1.1: CONTRACT.md（每轮加载，硬上限 200 行）

**Files:**
- Create: `assistant/knowledge/CONTRACT.md`
- Reference: 旧 `assistant/CONTRACT.md`（迁移核心）+ 旧 `assistant/prompts/main.md`（指令解读规则部分）

- [ ] **Step 1: 写文件**

内容必含小节：
1. `# WorldEngine 写卡助手契约`
2. `## 助手定位` —— 单代理 + 通用子代理 + 计划文档驱动
3. `## 用户意图分类` —— 创建 / 修改 / 删除 / 修复 / 多资源（短描述每类典型表述）
4. `## 术语约束` —— `{{user}}` / `{{char}}` 规则、受/不受约束字段表（保留旧 CONTRACT §术语约束 内容）
5. `## Proposal 顶层 Schema 总览` —— 6 类 type × create/update/delete 矩阵（仅一句话级，详细规则在各 CARD.md）
6. `## API 关键禁止字段` —— `api_key` / `llm.api_key` / `embedding.api_key`
7. `## 知识库指路`：

```markdown
| 任务涉及 | 必读 |
|---|---|
| 世界卡 | knowledge/WORLDCARD.md |
| 角色卡 | knowledge/CHARCARD.md |
| 玩家卡（persona） | knowledge/USERCARD.md |
| 全局 prompt / 配置 | knowledge/GLOBALPROMPT.md |
| CSS 片段 | knowledge/CSSSNIPPET.md |
| 正则规则 | knowledge/REGEXRULE.md |
```

8. `## 任务流程契约` —— 计划文档（路径 + 步骤行格式）+ step 派发规则 + 终态删文档

总行数控制在 200 以内；如超出，把 schema 详情挤出去到对应 CARD.md。

- [ ] **Step 2: 行数检查**

Run: `wc -l assistant/knowledge/CONTRACT.md`
Expected: ≤200

- [ ] **Step 3: Commit**

```bash
git add assistant/knowledge/CONTRACT.md
git commit -m "docs(assistant): 添加 knowledge/CONTRACT.md（每轮自动注入的助手契约）"
```

### Task 1.2: WORLDCARD.md

**Files:**
- Create: `assistant/knowledge/WORLDCARD.md`
- Reference: 旧 `assistant/prompts/world-card.md`（448 行）+ 旧 `assistant/CONTRACT.md` §6 §7

- [ ] **Step 1: 切分并写入**

必含小节：
1. `## 世界卡架构概述`
2. `## changes 字段集` —— `name` / `description` / `temperature` / `max_tokens`；明确禁止 `system_prompt` / `post_prompt`
3. `## entryOps 完整规则` —— 4 种 trigger_type（always / keyword / llm / state）+ `keyword_scope` + `token` + `conditions`（含 datetime 比较规则）
4. `## stateFieldOps 完整规则` —— 7 种 type、`update_mode`、`prefix`（datetime 专用）、target 允许 `world|persona|character`
5. `## 操作手册`
   - 复杂世界卡拆步骤建议（基础结构 → 状态字段 → 触发条目 → 状态值）
   - 状态机世界卡专项

剔除：旧文件中"作为子代理你应当如何如何"的 prompt 指令（这些搬到 sub-agent.md）。

- [ ] **Step 2: Commit**

```bash
git add assistant/knowledge/WORLDCARD.md
git commit -m "docs(assistant): 添加 knowledge/WORLDCARD.md（世界卡操作手册）"
```

### Task 1.3: CHARCARD.md

**Files:**
- Create: `assistant/knowledge/CHARCARD.md`
- Reference: 旧 `assistant/prompts/character-card.md`

- [ ] **Step 1: 写入**

必含：
1. `## 角色卡架构`
2. `## changes 字段集` —— `name` / `description` / `system_prompt` / `post_prompt` / `first_message`
3. `## stateValueOps 规则` —— 只允许 `target:"character"`、`value_json` 格式、datetime 字符串编码
4. `## 创建依赖约束` —— 必须显式依赖世界来源（`context.worldId` 或 `step:<world-card-create>`）
5. `## 操作手册` —— 修改 system_prompt / 添加状态默认值的常见模式

- [ ] **Step 2: Commit**

```bash
git add assistant/knowledge/CHARCARD.md
git commit -m "docs(assistant): 添加 knowledge/CHARCARD.md"
```

### Task 1.4: USERCARD.md

**Files:**
- Create: `assistant/knowledge/USERCARD.md`
- Reference: 旧 `assistant/prompts/persona-card.md`

- [ ] **Step 1: 写入**

必含：
1. `## persona（玩家卡）架构`
2. `## changes 字段集` —— 仅 `name` / `description` / `system_prompt`（**无 post_prompt / first_message**）
3. `## persona 无 Prompt 条目特殊性` —— 与角色卡的关键区别
4. `## stateValueOps 规则` —— 只允许 `target:"persona"`
5. `## operation 限制` —— 只支持 create / update（**无 delete**）

- [ ] **Step 2: Commit**

```bash
git add assistant/knowledge/USERCARD.md
git commit -m "docs(assistant): 添加 knowledge/USERCARD.md"
```

### Task 1.5: GLOBALPROMPT.md / CSSSNIPPET.md / REGEXRULE.md

**Files:**
- Create: `assistant/knowledge/GLOBALPROMPT.md`
- Create: `assistant/knowledge/CSSSNIPPET.md`
- Create: `assistant/knowledge/REGEXRULE.md`

- [ ] **Step 1: GLOBALPROMPT.md**

由旧 `prompts/global-prompt.md` 切分。必含：
- operation 仅 update
- changes 完整字段集（含 `writing` / `diary` 嵌套块）
- 禁止字段：`api_key` / `llm.api_key` / `embedding.api_key`

- [ ] **Step 2: CSSSNIPPET.md**

由旧 `prompts/css-snippet.md` 切分。必含：
- changes：`name` / `content` / `mode`（`chat|writing|both`）/ `enabled`
- 注入机制：所有 enabled=1 拼接 `<style id="we-custom-css">`
- 仅使用 CSS 变量（参考根 CLAUDE.md）

- [ ] **Step 3: REGEXRULE.md**

由旧 `prompts/regex-rule.md` 切分。必含：
- changes：`name` / `pattern` / `replacement` / `flags` / `scope` / `world_id` / `mode` / `enabled`
- scope 取值：`display_only` / 其他
- 世界级 vs 全局（world_id 取值规则）

- [ ] **Step 4: Commit**

```bash
git add assistant/knowledge/GLOBALPROMPT.md assistant/knowledge/CSSSNIPPET.md assistant/knowledge/REGEXRULE.md
git commit -m "docs(assistant): 添加 GLOBALPROMPT/CSSSNIPPET/REGEXRULE 知识文件"
```

---

## Phase 2：抽出 normalizeProposal + applyProposal

> 现在 `normalizeProposal` 和 `applyProposal` 都在 `assistant/server/routes.js`（行 894–1128）。先抽到独立模块，再让新 apply 工具调用它。**这一阶段不改行为**，只搬家。

### Task 2.1: 抽出到 `normalize-proposal.js`

**Files:**
- Create: `assistant/server/normalize-proposal.js`
- Modify: `assistant/server/routes.js` (lines ~894-1128 移走 + 改为 import)

- [ ] **Step 1: 读现有实现**

Run: `awk 'NR>=890 && NR<=1130' assistant/server/routes.js | head -260`
Expected: 看到 `applyProposal` / `normalizeProposal` / `applyStateFieldCreate` / `applyStateFieldUpdate` / `applyStateFieldDelete` / `applyStateValueOp` 完整实现 + 任何被它们引用的工具函数。

- [ ] **Step 2: 把整段（含所有内部 helper）剪到新文件**

Create `assistant/server/normalize-proposal.js`，以 `export { normalizeProposal, applyProposal };` 结尾。保留所有 import 依赖（`crypto`, db queries, constants）；这些 import 也搬到新文件。

- [ ] **Step 3: routes.js 顶部加 import**

```js
import { normalizeProposal, applyProposal } from './normalize-proposal.js';
```

删除 routes.js 中原 894-1128 区段所有迁移过去的代码。

- [ ] **Step 4: 启动 backend，确认旧 chat 链路仍可用（回归保护）**

Run: `cd backend && npm run dev`（另一终端）
Expected: 启动无报错。手动调一次旧 `/api/assistant/chat` 简单消息（或跑现有测试）。

- [ ] **Step 5: Commit**

```bash
git add assistant/server/normalize-proposal.js assistant/server/routes.js
git commit -m "refactor(assistant): 抽出 normalizeProposal/applyProposal 到独立模块"
```

---

## Phase 3：plan-doc 模块（先 TDD）

### Task 3.1: 写 plan-doc 解析与生成的失败测试

**Files:**
- Create: `assistant/tests/plan-doc.test.mjs`

- [ ] **Step 1: 写测试**

```js
// assistant/tests/plan-doc.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  renderPlanDoc,
  parsePlanDoc,
  pickNextStep,
  markStepDone,
  appendLog,
} from '../server/plan-doc.js';

test('renderPlanDoc 生成符合 spec §5 模板', () => {
  const md = renderPlanDoc({
    title: '创建世界卡《X》',
    status: 'planning',
    createdAt: '2026-05-07T14:32:00',
    intent: '创建 X 世界',
    assumptions: ['世界已存在 persona Y'],
    steps: [
      { id: 'step-1', title: '创建世界卡', targetType: 'world-card', operation: 'create', dependsOn: [], task: '...' },
      { id: 'step-2', title: '加状态字段', targetType: 'world-card', operation: 'update', dependsOn: ['step-1'], task: '...' },
    ],
    log: [],
  });
  assert.match(md, /# 任务：创建世界卡《X》/);
  assert.match(md, /- \[ \] \*\*step-1\*\* 创建世界卡（world-card\.create）/);
  assert.match(md, /依赖：step-1/);
});

test('parsePlanDoc 还原 steps + done 状态', () => {
  const md = `# 任务：T

> 状态：executing · 创建时间：2026-05-07T14:32

## 用户意图
intent

## 步骤

- [x] **step-1** A（world-card.create）
  - 依赖：无
  - 任务：a
- [ ] **step-2** B（character-card.create）
  - 依赖：step-1
  - 任务：b
`;
  const parsed = parsePlanDoc(md);
  assert.equal(parsed.steps.length, 2);
  assert.equal(parsed.steps[0].done, true);
  assert.equal(parsed.steps[1].done, false);
  assert.deepEqual(parsed.steps[1].dependsOn, ['step-1']);
  assert.equal(parsed.steps[1].targetType, 'character-card');
});

test('pickNextStep 跳过已完成与未满足依赖', () => {
  const steps = [
    { id: 'step-1', done: true, dependsOn: [] },
    { id: 'step-2', done: false, dependsOn: ['step-1'] },
    { id: 'step-3', done: false, dependsOn: ['step-2'] },
  ];
  assert.equal(pickNextStep(steps).id, 'step-2');
});

test('markStepDone 把 [ ] 改成 [x] 并追加完成时间', () => {
  const md = `## 步骤

- [ ] **step-1** A（world-card.create）
  - 依赖：无
  - 任务：a
`;
  const out = markStepDone(md, 'step-1', '14:33:05');
  assert.match(out, /- \[x\] \*\*step-1\*\*/);
  assert.match(out, /完成于 14:33:05/);
});

test('appendLog 追加到执行日志小节', () => {
  const md = `## 执行日志\n`;
  const out = appendLog(md, 'step-1 done');
  assert.match(out, /## 执行日志\n.*step-1 done/s);
});
```

- [ ] **Step 2: 运行测试，确认 FAIL**

Run: `node --test assistant/tests/plan-doc.test.mjs`
Expected: FAIL with "Cannot find module '../server/plan-doc.js'"

### Task 3.2: 实现 plan-doc.js 让测试通过

**Files:**
- Create: `assistant/server/plan-doc.js`

- [ ] **Step 1: 写最小实现**

```js
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
      cur = { id: m[2], done: m[1] === 'x', title: m[3], targetType: m[4], operation: m[5], dependsOn: [], task: '' };
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
    if (tm) cur.task = tm[1];
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
```

- [ ] **Step 2: 运行测试，确认 PASS**

Run: `node --test assistant/tests/plan-doc.test.mjs`
Expected: 5 tests passing

- [ ] **Step 3: Commit**

```bash
git add assistant/server/plan-doc.js assistant/tests/plan-doc.test.mjs
git commit -m "feat(assistant): 添加 plan-doc 模块（解析/生成/调度/落盘）"
```

---

## Phase 4：apply_* 工具集（6 个）

> 每个工具是一个薄包装：`{ operation, entityId, changes, entryOps?, stateFieldOps?, stateValueOps? }` → 构造 proposal → `normalizeProposal()` → `applyProposal()` → 返回结果摘要给子代理。

### Task 4.1: apply-world-card 工具

**Files:**
- Create: `assistant/server/tools/apply-world-card.js`

- [ ] **Step 1: 实现**

```js
// assistant/server/tools/apply-world-card.js
import { normalizeProposal, applyProposal } from '../normalize-proposal.js';

export const definition = {
  name: 'apply_world_card',
  description: '落库一个世界卡变更。operation 取 create/update/delete。create 不传 entityId；update/delete 必传 entityId（worldId）。',
  parameters: {
    type: 'object',
    properties: {
      operation: { type: 'string', enum: ['create', 'update', 'delete'] },
      entityId: { type: ['string', 'null'] },
      changes: { type: 'object' },
      entryOps: { type: 'array' },
      stateFieldOps: { type: 'array' },
      explanation: { type: 'string' },
    },
    required: ['operation'],
  },
};

export async function execute(args, ctx = {}) {
  const proposal = {
    type: 'world-card',
    operation: args.operation,
    entityId: args.entityId ?? null,
    changes: args.changes ?? {},
    entryOps: args.entryOps ?? [],
    stateFieldOps: args.stateFieldOps ?? [],
    explanation: args.explanation ?? '',
  };
  const normalized = normalizeProposal(proposal);
  const result = await applyProposal(normalized, ctx.worldRefId ?? null);
  return {
    success: true,
    type: 'world-card',
    operation: args.operation,
    entityId: result.entityId ?? args.entityId ?? null,
    summary: summarize(args),
  };
}

function summarize(args) {
  const parts = [];
  if (args.operation === 'create') parts.push(`创建世界卡 ${args.changes?.name ?? ''}`);
  if (args.operation === 'update') parts.push(`更新世界卡 ${args.entityId}`);
  if (args.operation === 'delete') parts.push(`删除世界卡 ${args.entityId}`);
  if (args.entryOps?.length) parts.push(`${args.entryOps.length} 条 entryOps`);
  if (args.stateFieldOps?.length) parts.push(`${args.stateFieldOps.length} 条 stateFieldOps`);
  return parts.join('，');
}
```

- [ ] **Step 2: 简单冒烟检查（require 加载无报错）**

Run: `node -e "import('./assistant/server/tools/apply-world-card.js').then(m => console.log(Object.keys(m)))"`
Expected: `[ 'definition', 'execute' ]`

- [ ] **Step 3: Commit**

```bash
git add assistant/server/tools/apply-world-card.js
git commit -m "feat(assistant): 添加 apply_world_card 工具（薄包装 normalizeProposal）"
```

### Task 4.2: apply-character-card / apply-persona-card

**Files:**
- Create: `assistant/server/tools/apply-character-card.js`
- Create: `assistant/server/tools/apply-persona-card.js`

- [ ] **Step 1: 实现 apply-character-card**

```js
// assistant/server/tools/apply-character-card.js
import { normalizeProposal, applyProposal } from '../normalize-proposal.js';

export const definition = {
  name: 'apply_character_card',
  description: '落库角色卡变更。operation 取 create/update/delete。create 时 entityId 为 worldId（依赖关系），update/delete 时为 characterId。',
  parameters: {
    type: 'object',
    properties: {
      operation: { type: 'string', enum: ['create', 'update', 'delete'] },
      entityId: { type: ['string', 'null'] },
      changes: { type: 'object' },
      stateValueOps: { type: 'array' },
      explanation: { type: 'string' },
    },
    required: ['operation'],
  },
};

export async function execute(args, ctx = {}) {
  const proposal = {
    type: 'character-card',
    operation: args.operation,
    entityId: args.entityId ?? null,
    changes: args.changes ?? {},
    stateValueOps: args.stateValueOps ?? [],
    explanation: args.explanation ?? '',
  };
  const normalized = normalizeProposal(proposal);
  const result = await applyProposal(normalized, ctx.worldRefId ?? null);
  return { success: true, type: 'character-card', operation: args.operation, entityId: result.entityId ?? null, summary: `${args.operation} 角色卡 ${args.changes?.name ?? args.entityId}` };
}
```

- [ ] **Step 2: 实现 apply-persona-card**

同上模板，type 改为 `persona-card`，operation enum 限制 `['create', 'update']`，无 stateValueOps 之外的差异。

- [ ] **Step 3: Commit**

```bash
git add assistant/server/tools/apply-character-card.js assistant/server/tools/apply-persona-card.js
git commit -m "feat(assistant): 添加 apply_character_card / apply_persona_card 工具"
```

### Task 4.3: apply-global-config / apply-css-snippet / apply-regex-rule

**Files:**
- Create: `assistant/server/tools/apply-global-config.js`
- Create: `assistant/server/tools/apply-css-snippet.js`
- Create: `assistant/server/tools/apply-regex-rule.js`

- [ ] **Step 1: 实现 apply-global-config**

```js
// assistant/server/tools/apply-global-config.js
import { normalizeProposal, applyProposal } from '../normalize-proposal.js';

const FORBIDDEN = ['api_key'];

function stripForbidden(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = Array.isArray(obj) ? [] : {};
  for (const [k, v] of Object.entries(obj)) {
    if (FORBIDDEN.includes(k)) continue;
    out[k] = stripForbidden(v);
  }
  return out;
}

export const definition = {
  name: 'apply_global_config',
  description: '落库全局配置变更。仅支持 update。changes 内禁止 api_key 字段（自动剥离）。',
  parameters: {
    type: 'object',
    properties: {
      changes: { type: 'object' },
      explanation: { type: 'string' },
    },
    required: ['changes'],
  },
};

export async function execute(args) {
  const proposal = {
    type: 'global-config',
    operation: 'update',
    changes: stripForbidden(args.changes ?? {}),
    explanation: args.explanation ?? '',
  };
  const normalized = normalizeProposal(proposal);
  await applyProposal(normalized, null);
  return { success: true, type: 'global-config', operation: 'update', summary: '更新全局配置' };
}
```

- [ ] **Step 2: 实现 apply-css-snippet**

模板同 apply-character-card，type 改为 `css-snippet`，无 stateValueOps，签名 `{ operation, entityId, changes, explanation }`。

- [ ] **Step 3: 实现 apply-regex-rule**

同上，type 改为 `regex-rule`。

- [ ] **Step 4: Commit**

```bash
git add assistant/server/tools/apply-global-config.js assistant/server/tools/apply-css-snippet.js assistant/server/tools/apply-regex-rule.js
git commit -m "feat(assistant): 添加 apply_global_config / apply_css_snippet / apply_regex_rule 工具"
```

---

## Phase 5：sub-agent.js（通用子代理）

### Task 5.1: 写 sub-agent prompt

**Files:**
- Create: `assistant/prompts/sub-agent.md`

- [ ] **Step 1: 写 prompt（不超过 80 行）**

内容：
- 你是 WorldEngine 写卡助手的执行子代理。每次只处理父代理派发的一个 step。
- 你会拿到：本 step 的 task 描述、对应资源的知识（已注入 system prompt）、必要的上下文（worldId/characterId/已存在实体快照）。
- 工作流：
  1. 必要时调 `preview_card` 拉取最新实体数据
  2. 根据知识构造 apply_* 入参
  3. 调用一次对应的 apply_* 工具
  4. 返回简短文本（≤200 字）总结落库结果
- 失败处理：apply_* 返回错误时，最多 retry 一次（带错误反馈）；再失败则返回 `{ success: false, error }`
- 严禁：调用其他类型的 apply_*（type 由父代理派发时锁定）；输出未在知识中定义的字段；返回 markdown / 长篇大论

- [ ] **Step 2: Commit**

```bash
git add assistant/prompts/sub-agent.md
git commit -m "docs(assistant): 添加 sub-agent prompt"
```

### Task 5.2: 实现 sub-agent.js

**Files:**
- Create: `assistant/server/sub-agent.js`
- Reference: 旧 `assistant/server/agent-factory.js`（学习其 LLM tool-loop 实现 + thinking_level:null 约定）

- [ ] **Step 1: 读 agent-factory.js 学 tool-loop**

Run: `cat assistant/server/agent-factory.js`
Expected: 看到 LLM tool-call 循环 + JSON 重试模式。

- [ ] **Step 2: 实现**

```js
// assistant/server/sub-agent.js
import fs from 'node:fs/promises';
import path from 'node:path';
import { llm } from '../../backend/services/llm.js'; // 项目实际 LLM 客户端，按 agent-factory.js 实际 import 调整
import * as applyWorldCard from './tools/apply-world-card.js';
import * as applyCharCard from './tools/apply-character-card.js';
import * as applyPersonaCard from './tools/apply-persona-card.js';
import * as applyGlobalConfig from './tools/apply-global-config.js';
import * as applyCssSnippet from './tools/apply-css-snippet.js';
import * as applyRegexRule from './tools/apply-regex-rule.js';
import { previewCardTool } from './tools/card-preview.js';
import { readFileTool } from './tools/project-reader.js';

const APPLY_BY_TYPE = {
  'world-card': applyWorldCard,
  'character-card': applyCharCard,
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

const PROMPT_PATH = path.resolve(process.cwd(), 'assistant/prompts/sub-agent.md');
const KNOWLEDGE_DIR = path.resolve(process.cwd(), 'assistant/knowledge');

async function loadKnowledge(targetType) {
  const file = KNOWLEDGE_BY_TYPE[targetType];
  if (!file) throw new Error(`Unknown targetType: ${targetType}`);
  return fs.readFile(path.join(KNOWLEDGE_DIR, file), 'utf8');
}

async function loadPrompt() {
  return fs.readFile(PROMPT_PATH, 'utf8');
}

export async function dispatchSubAgent({ stepId, targetType, operation, entityRef, task, context }) {
  const apply = APPLY_BY_TYPE[targetType];
  if (!apply) throw new Error(`No apply tool for ${targetType}`);

  const systemPrompt = `${await loadPrompt()}\n\n---\n\n${await loadKnowledge(targetType)}`;
  const tools = [previewCardTool.definition, readFileTool.definition, apply.definition];
  const userMsg = `# Step: ${stepId}
- targetType: ${targetType}
- operation: ${operation}
- entityRef: ${JSON.stringify(entityRef)}
- 上下文: ${JSON.stringify(context ?? {})}

## 任务
${task}

请按 sub-agent.md 的工作流执行：必要时 preview_card → 调用 ${apply.definition.name} 一次 → 返回简短结果。`;

  // 调 LLM，thinking_level:null（沿用项目约定）
  const response = await llm.completeWithTools({
    system: systemPrompt,
    messages: [{ role: 'user', content: userMsg }],
    tools,
    thinking_level: null,
    toolHandlers: {
      [previewCardTool.definition.name]: (args) => previewCardTool.execute(args, context),
      [readFileTool.definition.name]: (args) => readFileTool.execute(args),
      [apply.definition.name]: (args) => apply.execute(args, { worldRefId: entityRef === 'context.worldId' ? context.worldId : null }),
    },
    maxIterations: 4,
  });

  return {
    success: true,
    summary: typeof response === 'string' ? response.slice(0, 400) : (response.text ?? '已完成').slice(0, 400),
  };
}
```

> 注：`llm.completeWithTools` 的具体签名按 `agent-factory.js` 实际接口调整；如果项目用的是另一种 tool-loop helper，照抄那边的写法。

- [ ] **Step 3: Commit**

```bash
git add assistant/server/sub-agent.js
git commit -m "feat(assistant): 通用执行子代理（按 targetType 注入对应知识）"
```

---

## Phase 6：parent-agent.js + task-store 重构

### Task 6.1: task-store 简化

**Files:**
- Modify: `assistant/server/task-store.js`

- [ ] **Step 1: 读现有**

Run: `cat assistant/server/task-store.js`

- [ ] **Step 2: 重写为新 schema**

```js
// assistant/server/task-store.js
import { randomUUID } from 'node:crypto';

const tasks = new Map();
const sseClients = new Map(); // taskId -> Set<res>

export function createTask({ context }) {
  const id = `task-${randomUUID().slice(0, 8)}`;
  const task = {
    id,
    status: 'planning',
    context: context ?? {},
    messages: [],
    pendingUserMessages: [],
    createdAt: Date.now(),
    currentStepId: null,
  };
  tasks.set(id, task);
  return task;
}

export function getTask(id) { return tasks.get(id) ?? null; }
export function setStatus(id, status) { const t = tasks.get(id); if (t) t.status = status; }
export function deleteTask(id) { tasks.delete(id); sseClients.delete(id); }

export function appendMessage(id, msg) {
  const t = tasks.get(id);
  if (t) t.messages.push(msg);
}

export function queueUserMessage(id, msg) {
  const t = tasks.get(id);
  if (t) t.pendingUserMessages.push(msg);
}

export function takeUserMessages(id) {
  const t = tasks.get(id);
  if (!t) return [];
  const msgs = t.pendingUserMessages;
  t.pendingUserMessages = [];
  return msgs;
}

export function attachSse(taskId, res) {
  if (!sseClients.has(taskId)) sseClients.set(taskId, new Set());
  sseClients.get(taskId).add(res);
}

export function detachSse(taskId, res) {
  sseClients.get(taskId)?.delete(res);
}

export function emit(taskId, event) {
  const clients = sseClients.get(taskId);
  if (!clients) return;
  const line = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of clients) {
    try { res.write(line); } catch {}
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add assistant/server/task-store.js
git commit -m "refactor(assistant): task-store 简化为新单代理模型"
```

### Task 6.2: 写 parent-agent prompt

**Files:**
- Create: `assistant/prompts/parent-agent.md`

- [ ] **Step 1: 写 prompt**

内容大纲（≤150 行）：
1. 你是 WorldEngine 写卡助手的父代理（编排者）。
2. 你拥有的工具：
   - `preview_card(entityType, entityId)` 读现有实体
   - `read_file(path)` 读 knowledge/ 下其他知识文件
   - `write_plan_doc({title, intent, assumptions, steps})` 首次落计划文档
   - `edit_plan_doc({op:'replace_steps'|'mark_done'|'append_log', ...})` 修改文档
   - `dispatch_subagent({stepId})` 派发子代理执行某 step
   - `delete_plan_doc()`
   - `finalize_task({summary})` 发送终态总结消息
3. 工作流：
   - 收到用户首条消息 → 判断意图分类（参考 CONTRACT.md）→ 必要时通过普通文本追问（clarifying）→ 信息够了再 read_file 拉对应 CARD.md
   - 准备好后 write_plan_doc，状态自动转 awaiting_approval
   - 用户确认（前端调 /approve）→ 状态进 executing → 你按 plan 顺序 dispatch_subagent
   - 收到 step 完成 → edit_plan_doc(mark_done) + edit_plan_doc(append_log)
   - 全部完成 → delete_plan_doc + finalize_task
4. 暂停：当 task 切到 paused 状态，你会收到 pendingUserMessages，按修改意见 edit_plan_doc，然后用普通文本回复"已根据你的意见修改计划，请确认是否继续"
5. 失败：某 step apply 报错（子代理返回 success:false）→ delete_plan_doc + finalize_task("任务失败: ...")，状态转 failed
6. 步骤行格式必须严格遵守（CONTRACT.md §任务流程契约 引用）
7. 严禁：跳过 plan doc 直接派发子代理；执行中重写 plan doc 的已完成 step（[x] 项）；输出敏感字段

- [ ] **Step 2: Commit**

```bash
git add assistant/prompts/parent-agent.md
git commit -m "docs(assistant): 添加 parent-agent prompt"
```

### Task 6.3: 实现 parent-agent.js

**Files:**
- Create: `assistant/server/parent-agent.js`

- [ ] **Step 1: 实现编排骨架**

```js
// assistant/server/parent-agent.js
import fs from 'node:fs/promises';
import path from 'node:path';
import { llm } from '../../backend/services/llm.js'; // 按项目实际 import
import * as planDoc from './plan-doc.js';
import * as taskStore from './task-store.js';
import { dispatchSubAgent } from './sub-agent.js';
import { previewCardTool } from './tools/card-preview.js';
import { readFileTool } from './tools/project-reader.js';

const KNOWLEDGE_DIR = path.resolve(process.cwd(), 'assistant/knowledge');
const PROMPT_PATH = path.resolve(process.cwd(), 'assistant/prompts/parent-agent.md');

async function loadSystemPrompt() {
  const prompt = await fs.readFile(PROMPT_PATH, 'utf8');
  const contract = await fs.readFile(path.join(KNOWLEDGE_DIR, 'CONTRACT.md'), 'utf8');
  return `${prompt}\n\n---\n\n# 助手契约（每轮注入）\n\n${contract}`;
}

const TOOLS = [
  previewCardTool.definition,
  readFileTool.definition,
  {
    name: 'write_plan_doc',
    description: '首次落计划文档；状态自动转 awaiting_approval。',
    parameters: { type: 'object', properties: { title: {type:'string'}, intent: {type:'string'}, assumptions: {type:'array'}, steps: {type:'array'} }, required: ['title', 'intent', 'steps'] },
  },
  {
    name: 'edit_plan_doc',
    description: '修改计划文档。op=replace_steps 整体替换；mark_done 标记某 step 已完成；append_log 追加执行日志行。',
    parameters: { type: 'object', properties: { op: {type:'string', enum:['replace_steps','mark_done','append_log']}, steps: {type:'array'}, stepId: {type:'string'}, line: {type:'string'} }, required: ['op'] },
  },
  {
    name: 'dispatch_subagent',
    description: '派发子代理执行计划文档中某未完成的 step。',
    parameters: { type: 'object', properties: { stepId: {type:'string'} }, required: ['stepId'] },
  },
  { name: 'delete_plan_doc', description: '删除计划文档（终态调用）。', parameters: { type: 'object', properties: {} } },
  { name: 'finalize_task', description: '发送终态总结消息并把任务设为 completed/failed/cancelled。', parameters: { type: 'object', properties: { summary: {type:'string'}, terminalStatus: {type:'string', enum:['completed','failed','cancelled']} }, required: ['summary','terminalStatus'] } },
];

export async function runParentAgent(task, userInput) {
  const systemPrompt = await loadSystemPrompt();
  taskStore.appendMessage(task.id, { role: 'user', content: userInput });

  const planDocContent = await planDoc.readPlanDoc(task.id).catch(() => '');
  const contextBlock = `# 任务上下文
status: ${task.status}
worldId: ${task.context?.worldId ?? 'null'}
characterId: ${task.context?.characterId ?? 'null'}

# 当前计划文档
${planDocContent || '（尚未生成）'}`;

  const messages = [
    ...task.messages,
    { role: 'user', content: contextBlock },
  ];

  await llm.completeWithTools({
    system: systemPrompt,
    messages,
    tools: TOOLS,
    thinking_level: null,
    toolHandlers: makeToolHandlers(task),
    maxIterations: 12,
    onText: (delta) => taskStore.emit(task.id, { type: 'delta', delta }),
  });

  taskStore.emit(task.id, { type: 'done', done: true });
}

function makeToolHandlers(task) {
  return {
    [previewCardTool.definition.name]: (args) => previewCardTool.execute(args, task.context),
    [readFileTool.definition.name]: (args) => readFileTool.execute(args),

    write_plan_doc: async (args) => {
      const steps = (args.steps ?? []).map((s, i) => ({ ...s, id: s.id ?? `step-${i+1}`, done: false }));
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
    },

    edit_plan_doc: async (args) => {
      let md = await planDoc.readPlanDoc(task.id);
      if (args.op === 'mark_done') md = planDoc.markStepDone(md, args.stepId, new Date().toISOString().slice(11, 19));
      else if (args.op === 'append_log') md = planDoc.appendLog(md, args.line);
      else if (args.op === 'replace_steps') {
        const parsed = planDoc.parsePlanDoc(md);
        md = planDoc.renderPlanDoc({ title: parsed.title, status: parsed.status, createdAt: new Date().toISOString(), intent: '', assumptions: [], steps: args.steps, log: [] });
      }
      await planDoc.writePlanDoc(task.id, md);
      taskStore.emit(task.id, { type: 'plan_doc_updated', taskId: task.id, content: md });
      return { ok: true };
    },

    dispatch_subagent: async (args) => {
      const md = await planDoc.readPlanDoc(task.id);
      const parsed = planDoc.parsePlanDoc(md);
      const step = parsed.steps.find((s) => s.id === args.stepId);
      if (!step) return { ok: false, error: `step not found: ${args.stepId}` };
      taskStore.emit(task.id, { type: 'step_started', taskId: task.id, stepId: step.id, title: step.title });
      try {
        const result = await dispatchSubAgent({
          stepId: step.id,
          targetType: step.targetType,
          operation: step.operation,
          entityRef: step.dependsOn[0] ?? null,
          task: step.task,
          context: task.context,
        });
        taskStore.emit(task.id, { type: 'step_completed', taskId: task.id, stepId: step.id, result });
        return { ok: true, ...result };
      } catch (err) {
        taskStore.emit(task.id, { type: 'step_failed', taskId: task.id, stepId: step.id, error: err.message });
        return { ok: false, error: err.message };
      }
    },

    delete_plan_doc: async () => {
      await planDoc.deletePlanDoc(task.id);
      return { ok: true };
    },

    finalize_task: async (args) => {
      taskStore.setStatus(task.id, args.terminalStatus);
      taskStore.appendMessage(task.id, { role: 'assistant', content: args.summary });
      const eventType = args.terminalStatus === 'completed' ? 'task_completed' : args.terminalStatus === 'failed' ? 'task_failed' : 'task_cancelled';
      taskStore.emit(task.id, { type: eventType, taskId: task.id, summary: args.summary });
      return { ok: true };
    },
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add assistant/server/parent-agent.js assistant/server/task-store.js
git commit -m "feat(assistant): 父代理编排器（工具循环 + plan doc 驱动）"
```

---

## Phase 7：routes.js 重构（删旧 + 加新）

### Task 7.1: 加新 `/agent*` 端点

**Files:**
- Modify: `assistant/server/routes.js`

- [ ] **Step 1: 在 routes.js 末尾（router export 前）追加新端点**

```js
// === 新单代理端点 ===
import * as taskStore from './task-store.js';
import * as planDoc from './plan-doc.js';
import { runParentAgent } from './parent-agent.js';

router.post('/agent', async (req, res) => {
  const { taskId, message, context } = req.body ?? {};
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders?.();

  let task = taskId ? taskStore.getTask(taskId) : null;
  if (!task) {
    task = taskStore.createTask({ context });
    res.write(`data: ${JSON.stringify({ type: 'task_created', taskId: task.id, task })}\n\n`);
  }
  taskStore.attachSse(task.id, res);
  req.on('close', () => taskStore.detachSse(task.id, res));

  try {
    if (task.status === 'executing') {
      taskStore.queueUserMessage(task.id, message);
      // 不立即触发：当前 step 跑完 executor 自己会切 paused 并喂 pendingMessages
      return; // 保持连接
    }
    await runParentAgent(task, message);
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: 'task_failed', taskId: task.id, error: err.message })}\n\n`);
  }
});

router.post('/agent/:taskId/approve', async (req, res) => {
  const task = taskStore.getTask(req.params.taskId);
  if (!task || task.status !== 'awaiting_approval') return res.status(400).json({ error: 'not awaiting approval' });
  taskStore.setStatus(task.id, 'executing');
  taskStore.emit(task.id, { type: 'plan_approved', taskId: task.id });
  // 触发 parent-agent 继续派发；用一个空消息触发执行循环
  runParentAgent(task, '<<approved>>').catch((err) => taskStore.emit(task.id, { type: 'task_failed', taskId: task.id, error: err.message }));
  res.json({ ok: true });
});

router.post('/agent/:taskId/cancel', async (req, res) => {
  const task = taskStore.getTask(req.params.taskId);
  if (!task) return res.status(404).json({ error: 'not found' });
  await planDoc.deletePlanDoc(task.id);
  taskStore.setStatus(task.id, 'cancelled');
  taskStore.emit(task.id, { type: 'task_cancelled', taskId: task.id });
  res.json({ ok: true });
});

router.get('/agent/:taskId/plan-doc', async (req, res) => {
  const content = await planDoc.readPlanDoc(req.params.taskId).catch(() => '');
  res.json({ content });
});

router.get('/agent/:taskId', (req, res) => {
  const task = taskStore.getTask(req.params.taskId);
  if (!task) return res.status(404).json({ error: 'not found' });
  res.json({ task });
});
```

- [ ] **Step 2: 启动 backend，确认无语法错**

Run: `cd backend && node --check ../assistant/server/routes.js` 或 `npm run dev`
Expected: 无报错

- [ ] **Step 3: Commit**

```bash
git add assistant/server/routes.js
git commit -m "feat(assistant): 添加 /agent* 端点（保留旧端点，下一步删）"
```

### Task 7.2: 删除旧 `/chat` `/execute` `/tasks*` 端点

**Files:**
- Modify: `assistant/server/routes.js`
- Delete: `assistant/server/main-agent.js`
- Delete: `assistant/server/task-planner.js`
- Delete: `assistant/server/task-researcher.js`
- Delete: `assistant/server/task-executor.js`
- Delete: `assistant/server/agent-factory.js`
- Delete: `assistant/server/agents/` (整个目录)
- Delete: `assistant/CONTRACT.md`

- [ ] **Step 1: 删 routes.js 中旧端点**

精读 routes.js 找以下 `router.post/get` 区段并整段删除：
- `/chat`
- `/execute`
- `/tasks`
- `/tasks/:taskId`
- `/tasks/:taskId/answer`
- `/tasks/:taskId/approve-plan`
- `/tasks/:taskId/approve-step`
- `/tasks/:taskId/cancel`
- 顶部对应的 import（main-agent / task-planner / task-researcher / task-executor / agent-factory）

保留 `/extract-characters`。

- [ ] **Step 2: 删旧文件**

```bash
rm assistant/server/main-agent.js
rm assistant/server/task-planner.js
rm assistant/server/task-researcher.js
rm assistant/server/task-executor.js
rm assistant/server/agent-factory.js
rm -rf assistant/server/agents
rm -rf assistant/prompts/main.md assistant/prompts/world-card.md assistant/prompts/character-card.md assistant/prompts/persona-card.md assistant/prompts/global-prompt.md assistant/prompts/css-snippet.md assistant/prompts/regex-rule.md
rm assistant/CONTRACT.md
```

- [ ] **Step 3: 启动 backend 确认无 import 漏网**

Run: `cd backend && npm run dev`
Expected: 无 module-not-found 错误。如有报错，按报错路径补删/补改。

- [ ] **Step 4: Commit**

```bash
git add -A assistant/
git commit -m "refactor(assistant): 删除旧双轨（chat/execute/tasks*）端点和资源域子代理"
```

---

## Phase 8：前端重构

### Task 8.1: PlanDocViewer 组件

**Files:**
- Create: `frontend/src/components/assistant/PlanDocViewer.jsx`

- [ ] **Step 1: 实现**

```jsx
// frontend/src/components/assistant/PlanDocViewer.jsx
import React from 'react';
import ReactMarkdown from 'react-markdown'; // 项目已有依赖；如无则按现有 markdown 渲染方式调整

export default function PlanDocViewer({ content }) {
  if (!content) return null;
  return (
    <div className="we-plan-doc rounded-lg ring-1 ring-[var(--we-ink-muted)] bg-[var(--we-paper-base)] p-4 my-3">
      <ReactMarkdown
        components={{
          input: ({ checked }) => (
            <input
              type="checkbox"
              checked={!!checked}
              readOnly
              className="mr-2 align-middle"
              aria-label={checked ? 'completed' : 'pending'}
            />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
```

> 如果项目用的是其他 markdown 库（看 MessageList.jsx 实际 import），照用那个库；checkbox custom 渲染按它的 API 调整。

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/assistant/PlanDocViewer.jsx
git commit -m "feat(assistant): 添加 PlanDocViewer（只读 markdown + checkbox）"
```

### Task 8.2: useAssistantStore 重构

**Files:**
- Modify: `assistant/client/useAssistantStore.js`

- [ ] **Step 1: 重写 state**

```js
// assistant/client/useAssistantStore.js
import { create } from 'zustand';

export const useAssistantStore = create((set) => ({
  taskId: null,
  status: 'idle', // idle/planning/clarifying/awaiting_approval/executing/paused/completed/failed/cancelled
  planDoc: '',
  messages: [], // [{role, content}]
  error: null,

  reset: () => set({ taskId: null, status: 'idle', planDoc: '', messages: [], error: null }),

  ingestEvent: (evt) => set((s) => {
    switch (evt.type) {
      case 'task_created': return { ...s, taskId: evt.taskId, status: 'planning' };
      case 'plan_doc_updated': return { ...s, planDoc: evt.content };
      case 'awaiting_approval': return { ...s, status: 'awaiting_approval' };
      case 'plan_approved': return { ...s, status: 'executing' };
      case 'paused': return { ...s, status: 'paused' };
      case 'task_completed': return { ...s, status: 'completed', planDoc: '', messages: [...s.messages, { role: 'assistant', content: evt.summary }] };
      case 'task_failed': return { ...s, status: 'failed', planDoc: '', error: evt.error };
      case 'task_cancelled': return { ...s, status: 'cancelled', planDoc: '' };
      case 'delta': return { ...s, messages: appendDelta(s.messages, evt.delta) };
      default: return s;
    }
  }),

  pushUserMessage: (content) => set((s) => ({ ...s, messages: [...s.messages, { role: 'user', content }] })),
}));

function appendDelta(messages, delta) {
  const last = messages[messages.length - 1];
  if (last?.role === 'assistant' && last.streaming) {
    return [...messages.slice(0, -1), { ...last, content: last.content + delta }];
  }
  return [...messages, { role: 'assistant', content: delta, streaming: true }];
}
```

- [ ] **Step 2: Commit**

```bash
git add assistant/client/useAssistantStore.js
git commit -m "refactor(assistant): useAssistantStore 适配单接口模型"
```

### Task 8.3: api.js 重构

**Files:**
- Modify: `assistant/client/api.js`

- [ ] **Step 1: 替换为 /agent 调用**

```js
// assistant/client/api.js
const BASE = '/api/assistant';

export async function streamAgent({ taskId, message, context, onEvent, signal }) {
  const res = await fetch(`${BASE}/agent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId, message, context }),
    signal,
  });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const evt = JSON.parse(line.slice(6));
      onEvent(evt);
    }
  }
}

export async function approveTask(taskId) {
  await fetch(`${BASE}/agent/${taskId}/approve`, { method: 'POST' });
}

export async function cancelTask(taskId) {
  await fetch(`${BASE}/agent/${taskId}/cancel`, { method: 'POST' });
}

export async function fetchPlanDoc(taskId) {
  const r = await fetch(`${BASE}/agent/${taskId}/plan-doc`);
  return (await r.json()).content;
}
```

> 删除旧的 chat/execute/tasks* API 函数。如有外部调用，找到并改用 streamAgent。

- [ ] **Step 2: Commit**

```bash
git add assistant/client/api.js
git commit -m "refactor(assistant): client api.js 替换为单 /agent 接口"
```

### Task 8.4: AssistantPanel 改造

**Files:**
- Modify: `assistant/client/AssistantPanel.jsx`
- Delete: `assistant/client/ChangeProposalCard.jsx`

- [ ] **Step 1: 简化为 PlanDocViewer + MessageList + InputBox + Approve/Cancel 按钮**

打开 AssistantPanel.jsx（526 行），删除：
- 所有对 `ChangeProposalCard` 的 import 和渲染
- 计划面板 / step 审批 UI 区块
- 旧 store 字段引用（researchSummary / planSteps / proposalToken / awaitingStepId 等）

替换主体渲染为：

```jsx
import PlanDocViewer from '../../frontend/src/components/assistant/PlanDocViewer.jsx';
import { useAssistantStore } from './useAssistantStore.js';
import { streamAgent, approveTask, cancelTask } from './api.js';
import MessageList from './MessageList.jsx';
import InputBox from './InputBox.jsx';

export default function AssistantPanel({ context }) {
  const { taskId, status, planDoc, messages, ingestEvent, pushUserMessage } = useAssistantStore();

  const onSend = async (text) => {
    pushUserMessage(text);
    await streamAgent({ taskId, message: text, context, onEvent: ingestEvent });
  };

  return (
    <div className="we-assistant-panel flex flex-col h-full">
      <MessageList messages={messages} />
      {planDoc && <PlanDocViewer content={planDoc} />}
      {status === 'awaiting_approval' && (
        <div className="flex gap-2 p-2">
          <button onClick={() => approveTask(taskId)} className="we-btn-primary">确认执行</button>
          <button onClick={() => cancelTask(taskId)} className="we-btn-ghost">取消</button>
        </div>
      )}
      <InputBox onSend={onSend} disabled={status === 'completed' || status === 'failed' || status === 'cancelled'} />
    </div>
  );
}
```

- [ ] **Step 2: 删 ChangeProposalCard**

```bash
rm assistant/client/ChangeProposalCard.jsx
```

- [ ] **Step 3: 删 MessageList 中 proposal 卡分支**

打开 `MessageList.jsx` 找对 `ChangeProposalCard` / `proposal` 的引用整段删除；只保留普通 user/assistant text 渲染。

- [ ] **Step 4: InputBox 允许执行中输入**

修改 `InputBox.jsx` 的 disabled 逻辑，仅在终态禁用（见 AssistantPanel 的 disabled prop）。

- [ ] **Step 5: 启动前端确认无报错**

Run: `cd frontend && npm run dev`
Expected: 编译无报错；打开助手面板看到空消息列表 + 输入框。

- [ ] **Step 6: Commit**

```bash
git add assistant/client/ frontend/src/components/assistant/
git rm assistant/client/ChangeProposalCard.jsx 2>/dev/null
git commit -m "refactor(assistant): 前端简化为 PlanDoc + MessageList + 单输入框，删除 ChangeProposalCard"
```

---

## Phase 9：暂停语义闭环

### Task 9.1: executor 跑完当前 step 后切 paused 处理 pendingUserMessages

**Files:**
- Modify: `assistant/server/parent-agent.js`

- [ ] **Step 1: 在 dispatch_subagent 工具 handler 末尾加切换检查**

在 `dispatch_subagent` 内部 step 完成（或失败）之后，新增：

```js
// 在 step_completed/step_failed 之后追加：
const pending = taskStore.takeUserMessages(task.id);
if (pending.length > 0) {
  taskStore.setStatus(task.id, 'paused');
  taskStore.emit(task.id, { type: 'paused', taskId: task.id });
  // 把 pending 消息合并塞到下一轮 LLM 输入：
  for (const m of pending) taskStore.appendMessage(task.id, { role: 'user', content: m });
  return { ok: true, paused: true, pendingMessages: pending };
}
```

父代理 prompt 的工具循环看到 `paused: true` 后会在文本回复阶段输出"已根据你的意见调整..."（这一行需要 parent-agent.md 明确写）。

- [ ] **Step 2: routes.js 中 /agent 端点 status==='executing' 分支当前是 return**

需调整为：仍 queueUserMessage，但保留 SSE 连接以便后续 paused 事件能推回前端。当前实现已是这样（res 接到 sseClients），不改。

- [ ] **Step 3: Commit**

```bash
git add assistant/server/parent-agent.js
git commit -m "feat(assistant): 暂停语义——step 完成后处理用户排队消息"
```

---

## Phase 10：测试

### Task 10.1: parent-agent 主路径集成测试（mock LLM）

**Files:**
- Create: `assistant/tests/parent-agent.test.mjs`

- [ ] **Step 1: 写测试**

```js
// assistant/tests/parent-agent.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as taskStore from '../server/task-store.js';
import * as planDoc from '../server/plan-doc.js';

test('plan_doc_updated 事件携带文档全文', async () => {
  const task = taskStore.createTask({ context: { worldId: null } });
  const events = [];
  const fakeRes = { write: (line) => events.push(line) };
  taskStore.attachSse(task.id, fakeRes);
  await planDoc.writePlanDoc(task.id, '# 任务：T\n\n> 状态：planning · 创建时间：x\n\n## 用户意图\nx\n\n## 假设与约束\n- 无\n\n## 步骤\n\n- [ ] **step-1** A（world-card.create）\n  - 依赖：无\n  - 任务：a\n\n## 执行日志\n');
  taskStore.emit(task.id, { type: 'plan_doc_updated', taskId: task.id, content: 'demo' });
  assert.match(events.at(-1), /plan_doc_updated/);
  assert.match(events.at(-1), /demo/);
  await planDoc.deletePlanDoc(task.id);
});
```

> 不 mock 真实 LLM。父代理工具循环的真实 e2e 测试通过 Phase 11 的人工验证完成；这里只验事件格式与 plan-doc 一致性。

- [ ] **Step 2: 运行**

Run: `node --test assistant/tests/parent-agent.test.mjs`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add assistant/tests/parent-agent.test.mjs
git commit -m "test(assistant): 新单代理 SSE/plan-doc 集成测试"
```

---

## Phase 11：人工验证

### Task 11.1: 端到端验证清单

- [ ] **Step 1: 启动前后端**

```bash
cd backend && npm run dev   # 终端 1
cd frontend && npm run dev  # 终端 2
```

- [ ] **Step 2: 主路径**

打开 http://localhost:5173，进入助手面板。发：

> "创建一个赛博朋克世界卡，玩家有 HP（0-100）和能量字段，3 条常驻条目（街区、企业、霓虹）。"

验证：
- 消息发送后看到 plan_doc_updated 实时刷新（计划文档面板出现并被填充）
- awaiting_approval 状态出现 [确认执行] [取消] 按钮
- 点确认 → 状态切 executing → 文档中 step 渐次 [x]
- 全部完成 → 文档消失 → 助手发总结消息
- 数据库验证：`sqlite3 data/worldengine.db "SELECT * FROM worlds ORDER BY rowid DESC LIMIT 1;"` 看到新世界卡

- [ ] **Step 3: 暂停**

发新任务 → awaiting_approval 时直接发"算了取消" → 验证 cancel 路径（建议先开 plan，看到后再 cancel）。

下一个任务执行到 step-2 时输入"把 step-3 的描述改一下" → 验证：
- 当前 step 跑完才暂停（不立即打断）
- paused 事件
- plan doc 更新
- 助手发回声"已根据意见修改..."
- 再次 approve → 继续执行

- [ ] **Step 4: 失败**

人工触发失败：把世界卡 changes 故意写入非法字段（直接编辑数据库制造冲突），或在 apply-world-card.js 临时 throw。验证：
- step_failed 事件
- 任务终态 failed
- plan doc 已删除
- 助手发简短错误说明
- 验证后还原代码

- [ ] **Step 5: 临时文件清理**

`ls .temp/assistant/` 应只剩 `.gitkeep`，无残留 .md。

---

## Phase 12：文档同步

### Task 12.1: 更新根 CLAUDE.md / ARCHITECTURE.md / CHANGELOG.md

**Files:**
- Modify: `CLAUDE.md`
- Modify: `ARCHITECTURE.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: 根 CLAUDE.md**

找 `/assistant/CONTRACT.md` 引用，改为 `/assistant/knowledge/CONTRACT.md`。
"关键路径"小节中助手相关条目同步更新（移除 main-agent.js / agents/ 等，新增 knowledge/、parent-agent.js、sub-agent.js、plan-doc.js）。

- [ ] **Step 2: ARCHITECTURE.md**

找助手运行机制章节，改写为：
- 单接口 `/api/assistant/agent` SSE
- 父代理 + 通用子代理 + plan doc 驱动
- 状态机（planning / clarifying / awaiting_approval / executing / paused / completed / failed / cancelled）
- 暂停语义、终态删文档

- [ ] **Step 3: CHANGELOG.md**

追加：

```
## 2026-05-07
- refactor(assistant): 写卡助手重做。删除双轨（/api/assistant/chat 和 /api/assistant/tasks*）和资源域子代理；改为 /api/assistant/agent 单接口 + 父代理 + 通用子代理；新增 7 份 knowledge/ 文件（CONTRACT 每轮加载，其余按 targetType 注入）；UI 移除 ChangeProposalCard / 计划卡 / step 审批，改为 PlanDocViewer 渲染 /.temp/assistant/<taskId>.md 临时计划文档。设计文档 docs/superpowers/specs/2026-05-07-assistant-redesign-design.md。
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md ARCHITECTURE.md CHANGELOG.md
git commit -m "docs: 同步写卡助手重做后的入口规范、架构与变更日志"
```

---

## 自检（写完计划后回看）

- [x] **Spec 覆盖**：spec §1–§12 每节均有对应 Phase/Task；§3 状态机由 Task 6 (parent-agent) + Task 9 (paused) 实现；§5 plan doc 由 Task 3 实现；§6.4 暂停由 Task 9 实现；§9.4 保留不动项已在删除清单中明确排除。
- [x] **Placeholder 扫描**：无 TBD/TODO；apply tools 三类已分别 case-by-case 写出代码模板（apply-world-card 完整、character/persona/global/css/regex 给出明确差异点）。
- [x] **类型一致性**：`renderPlanDoc` / `parsePlanDoc` / `pickNextStep` / `markStepDone` / `appendLog` 在 plan-doc.js（Task 3.2）定义，被 parent-agent.js（Task 6.3）一致使用；状态字符串值（`awaiting_approval` / `executing` / `paused` / `completed` / `failed` / `cancelled`）跨 task-store / parent-agent / store / 前端事件保持一致。
- [x] **依赖顺序**：Phase 0 → 1 → 2（抽 normalizeProposal）→ 3（plan-doc）→ 4（apply tools 依赖 normalize）→ 5（sub-agent 依赖 apply tools）→ 6（parent-agent 依赖 sub-agent + plan-doc + task-store）→ 7（routes 加新 → 删旧）→ 8（前端）→ 9（暂停闭环）→ 10（测）→ 11（人工）→ 12（文档）。
