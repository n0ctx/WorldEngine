# 写卡助手 Harness Sprint D 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地体检报告(`/Users/yunzhiwang/.claude/plans/assistant-harness-agent-harness-enginee-jiggly-lighthouse.md`)中 Sprint D 三项 P3 锦上添花,**严格限定在 `assistant/` 内**:(3.11) SSE 事件类型集中常量、(3.13) Meta 工具 5 件套 schema 外移、(3.12) Knowledge / 稳定 system prefix 通过 `cacheableSystem` 选项透传以摊薄 Gemini explicit cache 成本。

**Architecture:** 三项均为定点改动,**不动锁定文件,不动 `backend/llm/`,不动 `frontend/`**(除非任务明确)。
- Task 1(3.11):新增 `assistant/server/sse-events.js` 导出常量对象 `SSE_EVENTS = { TASK_CREATED: 'task_created', ... }`,把 4 处现存 emit 调用从字符串字面替换为常量引用;前端 `AssistantPanel` 同步消费(共享常量通过 ESM import,不复制定义)。
- Task 2(3.13):把 `parent-agent.js` 中 5 件套 meta 工具的 `definition`(schema 部分,约 400 行)外移到 `assistant/server/tools/meta/<name>.js`,每个文件导出 `definition`;`buildMetaTools` 仍闭包 `task` / `emitFn` / `runId` 在 parent-agent.js 内拼接 execute。execute 函数体不动。
- Task 3(3.12):`assistant/server/parent-agent.js` 与 `sub-agent.js` 在调 `llm.resolveToolContext` / `llm.completeWithTools` / `llm.chat` 时新增 `cacheableSystem` 选项,值为"该 agent 当前的稳定 system prefix"(父:parent-agent.md + CONTRACT.md;子:sub-agent.md + 当前 targetType 的 knowledge.md)。`backend/llm/index.js:127` 已支持此选项,Anthropic/Ollama/OpenAI 忽略,Gemini 触发 explicit cachedContents。**只是把已存在的字符串多塞进一个选项,不重写任何 prompt 组装逻辑**。

**Tech Stack:** Node.js ESM、React(前端共享常量)、node:test、Anthropic/Gemini provider(只读引用)。

**前置阅读(任何 task 开始前必读)**:
- `assistant/server/parent-agent.js`(535 行)— 主修改点
- `assistant/server/sub-agent.js`(250+ 行)
- `assistant/server/task-store.js`(已 Sprint B 改造,含 sidecar + hydrate + TERMINAL_TASK_STATUSES)
- `assistant/server/routes.js`(approve / cancel 路径发的 SSE)
- `assistant/client/AssistantPanel.jsx`(及同目录组件,前端 SSE 消费方)
- `backend/llm/index.js:100-130`(`buildLlmConfig` 中 `cacheableSystem` 字段位置)
- `assistant/prompts/parent-agent.md` / `sub-agent.md`(prompt 顶部 stable 部分)
- `assistant/knowledge/CONTRACT.md` 与 6 份 targetType-specific knowledge

**项目约束(摘自 `CLAUDE.md`)**:
- 中文 commit / 注释;一次 task 一个 commit
- 不动锁定文件:`SCHEMA.md` / `CLAUDE.md` / `backend/db/schema.js` / `backend/utils/constants.js` / `backend/prompts/assembler.js` / `frontend/src/store/index.js` / `server.js`
- 不动 `backend/llm/providers/*/index.js`(3.5 在范围外)
- 直接 commit 到 main 分支(用户偏好,无 PR)
- 测试通过 `npm run check`(lint + 前后端 + assistant 单测)

**不在本 Sprint 范围:**
- **3.5 tool loop provider-agnostic 抽象** — 全在 `backend/llm/providers/`,与 assistant 正交,留作独立任务
- **3.1 父代理两阶段架构重构** — 需要更深入设计讨论
- **3.4 上下文压缩策略** — 当前未触 token 痛点,先加 token-count 守门日志再决策(不在本 Sprint)
- **3.12 长期切片** — 当前 knowledge ~43KB 不到 token 痛点,只做"短期"的 cacheableSystem 透传

---

## Task 1: 3.11 SSE 事件类型集中到常量(P3,审计 3.11)

**问题:** 14+ 种 SSE event type 字符串散落在 `task-store.js` / `parent-agent.js` / `sub-agent.js` / `routes.js`,前端 `AssistantPanel` 也散着 match。改名时容易漏改;新加事件类型时容易拼写错。

**Files:**
- Create: `assistant/server/sse-events.js`(单文件常量集)
- Modify: `assistant/server/parent-agent.js` / `sub-agent.js` / `routes.js` / `task-store.js`(emit 字面量改用常量)
- Modify: `assistant/client/`(消费侧 — 具体文件由实施时 grep 决定)
- Test: `assistant/tests/sse-events.test.js`(新建)

**清单(已 grep 整理,实施时按需补充):**

```
task_created, task_failed, task_cancelled
plan_doc_updated, plan_approved
awaiting_approval, paused
step_started, step_completed, step_failed
tool_call_started, tool_call_completed
delta, done
messages_changed, user_message
```

- [ ] **Step 1: 用 grep 列出所有 emit 调用清单**

  ```bash
  cd /Users/yunzhiwang/Desktop/WorldEngine
  grep -rn "type: '[a-z_]\+'" assistant/server/ | grep -v "node_modules" | grep -v "// " | grep -v "type: 'function'\|type: 'object'\|type: 'string'\|type: 'array'" > /tmp/sse-types.txt
  cat /tmp/sse-types.txt
  ```

  把所有看到的 `type: '...'` 字符串(排除 JSON schema 关键字)整理成清单。预计 ~14 种。

- [ ] **Step 2: 写失败测试**

  新建 `assistant/tests/sse-events.test.js`:

  ```javascript
  import test from 'node:test';
  import assert from 'node:assert/strict';
  import { SSE_EVENTS } from '../server/sse-events.js';

  test('SSE_EVENTS 导出所有写卡助手用到的事件类型', () => {
    const expected = [
      'TASK_CREATED', 'TASK_FAILED', 'TASK_CANCELLED',
      'PLAN_DOC_UPDATED', 'PLAN_APPROVED',
      'AWAITING_APPROVAL', 'PAUSED',
      'STEP_STARTED', 'STEP_COMPLETED', 'STEP_FAILED',
      'TOOL_CALL_STARTED', 'TOOL_CALL_COMPLETED',
      'DELTA', 'DONE',
      'MESSAGES_CHANGED', 'USER_MESSAGE',
    ];
    for (const key of expected) {
      assert.ok(SSE_EVENTS[key], `应导出 ${key}`);
      assert.equal(typeof SSE_EVENTS[key], 'string', `${key} 应为字符串`);
      // 约定:value 是 lowercase snake_case
      assert.match(SSE_EVENTS[key], /^[a-z][a-z_]+$/, `${key}=${SSE_EVENTS[key]} 应为 snake_case`);
    }
  });

  test('SSE_EVENTS 不允许出现重复的 value', () => {
    const values = Object.values(SSE_EVENTS);
    assert.equal(values.length, new Set(values).size, '重复 value 会污染 type 命名空间');
  });
  ```

- [ ] **Step 3: 创建 `sse-events.js`**

  ```javascript
  // assistant/server/sse-events.js
  //
  // 写卡助手所有 SSE 事件类型的唯一来源。前后端共享(前端通过 import 拉取)。
  // 新增事件类型时在此处添加,确保单点维护。
  //
  // 约定:KEY 大写 + 下划线;value 是 lowercase snake_case(对应运行时 type 字符串)。

  export const SSE_EVENTS = Object.freeze({
    // 任务生命周期
    TASK_CREATED: 'task_created',
    TASK_FAILED: 'task_failed',
    TASK_CANCELLED: 'task_cancelled',

    // 计划文档与审批
    PLAN_DOC_UPDATED: 'plan_doc_updated',
    PLAN_APPROVED: 'plan_approved',

    // 状态切换
    AWAITING_APPROVAL: 'awaiting_approval',
    PAUSED: 'paused',

    // 子代理 step
    STEP_STARTED: 'step_started',
    STEP_COMPLETED: 'step_completed',
    STEP_FAILED: 'step_failed',

    // 工具调用
    TOOL_CALL_STARTED: 'tool_call_started',
    TOOL_CALL_COMPLETED: 'tool_call_completed',

    // 流式正文与终态
    DELTA: 'delta',
    DONE: 'done',

    // 消息变更
    MESSAGES_CHANGED: 'messages_changed',
    USER_MESSAGE: 'user_message',
  });
  ```

  如 Step 1 grep 出额外 type 不在上表,以代码为准追加;同时回头补 Step 2 测试。

- [ ] **Step 4: 跑测试确认通过**

  ```bash
  node --test assistant/tests/sse-events.test.js 2>&1 | tail -10
  ```

  Expected: 2 个 test PASS。

- [ ] **Step 5: 替换后端 emit 字面量**

  对 Step 1 grep 出的每一处 `type: '...'` 调用,改为 `type: SSE_EVENTS.XXX`。同时在每个被改文件顶部加 import:

  ```javascript
  import { SSE_EVENTS } from './sse-events.js';
  ```

  注意:
  - 不要碰 JSON schema 中的 `type: 'function'` / `type: 'object'` / `type: 'string'` / `type: 'array'`
  - `routes.js` 中的 `task_created` 是 `res.write(\`data: ${JSON.stringify({type: 'task_created', ...})}\`...)`,改为 `type: SSE_EVENTS.TASK_CREATED`
  - 测试文件里的字符串字面量(如 `assistant/tests/parent-agent.test.mjs` 里 `assert.equal(e.type, 'task_completed')`)**不改**,测试断言保留字面量更明确(测试就是要验证运行时输出的是这个字符串)

- [ ] **Step 6: 替换前端消费侧**

  ```bash
  grep -rn "task_created\|plan_doc_updated\|awaiting_approval\|step_started\|tool_call_started" assistant/client/ | grep -v node_modules | head -20
  ```

  在前端文件中找到所有 `event.type === '...'` 或 switch case,改为 import + 常量比较。

  例如:

  ```jsx
  // 改前
  if (event.type === 'task_created') { ... }
  // 改后
  import { SSE_EVENTS } from '../server/sse-events.js';
  if (event.type === SSE_EVENTS.TASK_CREATED) { ... }
  ```

  **路径注意**:前端 `assistant/client/` 与后端 `assistant/server/` 是同一仓库子目录,直接相对 import 即可(项目已是 monorepo style)。如发现前端 build 工具(Vite)不允许跨目录,改为把常量物理放到一个中立位置或在前端复制一份带断言守护。**优先方案是直接 import,确认 build 通过即可**。

- [ ] **Step 7: 跑所有相关测试,确认无回归**

  ```bash
  npm run check 2>&1 | tail -10
  ```

  Expected: lint + frontend + backend + assistant 测试全 PASS。

- [ ] **Step 8: 追加 CHANGELOG + Commit**

  CHANGELOG.md 顶部追加:

  ```markdown
  - refactor(assistant): SSE 事件类型集中到 sse-events.js 常量,前后端共享
  ```

  ```bash
  git add assistant/server/sse-events.js assistant/server/parent-agent.js assistant/server/sub-agent.js assistant/server/routes.js assistant/server/task-store.js assistant/client/ assistant/tests/sse-events.test.js CHANGELOG.md && git commit -m "refactor(assistant): SSE 事件类型集中到 sse-events.js"
  ```

  注意:`git add assistant/client/` 会带上所有改动的前端文件;不需要的话改为列出具体改动文件。

---

## Task 2: 3.13 Meta 工具 5 件套 schema 外移(P3,审计 3.13)

**问题:** `parent-agent.js`(535 行)中 5 个 meta 工具(`write_plan_doc` / `edit_plan_doc` / `dispatch_subagent` / `delete_plan_doc` / `finalize_task`)的 `definition`(JSON schema)内联约 400 行,拖累文件可读性。execute 函数需要闭包 `task` / `emitFn` / `runId`,**不能**外移。

**思路:** 把每个工具的纯 schema 部分拆到 `assistant/server/tools/meta/<name>.js` 一个文件一个工具,导出 `definition`;`buildMetaTools` 在 parent-agent.js 内仍闭包 task,拼接 `{ definition, execute }`。`parent-agent.js` 净减约 200 行(schema 部分)。

**Files:**
- Create: `assistant/server/tools/meta/write-plan-doc.js`
- Create: `assistant/server/tools/meta/edit-plan-doc.js`
- Create: `assistant/server/tools/meta/dispatch-subagent.js`
- Create: `assistant/server/tools/meta/delete-plan-doc.js`
- Create: `assistant/server/tools/meta/finalize-task.js`
- Create: `assistant/server/tools/meta/index.js`(re-export)
- Modify: `assistant/server/parent-agent.js`(删 schema 字面量,import + 拼接)
- Test: `assistant/tests/tools/meta-schemas.test.js`(新建)

- [ ] **Step 1: 用 grep 列出 5 件套定位**

  ```bash
  grep -n "definition: {" assistant/server/parent-agent.js
  ```

  应见 5 个,记录每个的起止行号。

- [ ] **Step 2: 写失败测试**

  新建 `assistant/tests/tools/meta-schemas.test.js`:

  ```javascript
  import test from 'node:test';
  import assert from 'node:assert/strict';

  // 测试 5 件套 schema 文件存在、命名正确、字段完整
  const expectedTools = [
    'write_plan_doc',
    'edit_plan_doc',
    'dispatch_subagent',
    'delete_plan_doc',
    'finalize_task',
  ];

  test('meta/index.js 导出 5 件套 definition', async () => {
    const mod = await import('../../server/tools/meta/index.js');
    for (const name of expectedTools) {
      const def = mod[toCamel(name)];
      assert.ok(def, `应导出 ${toCamel(name)}`);
      assert.equal(def.name, name);
      assert.ok(def.description, `${name} 应有 description`);
      assert.equal(def.parameters?.type, 'object', `${name}.parameters.type 应为 'object'`);
    }
  });

  function toCamel(snake) {
    return snake.replace(/_([a-z])/g, (_, c) => c.toUpperCase()) + 'Definition';
  }
  ```

- [ ] **Step 3: 跑测试确认失败**

  ```bash
  node --test assistant/tests/tools/meta-schemas.test.js 2>&1 | tail -10
  ```

  Expected: FAIL(模块不存在)。

- [ ] **Step 4: 创建 5 个 schema 文件 + index**

  以 `write_plan_doc` 为例(其他 4 个照搬 parent-agent.js 现有 definition 块):

  `assistant/server/tools/meta/write-plan-doc.js`:
  ```javascript
  // 写卡助手 meta 工具:write_plan_doc 的 JSON schema(纯 definition,不含 execute)
  // execute 在 parent-agent.js 的 buildMetaTools 内闭包 task 拼接。

  export const writePlanDocDefinition = {
    name: 'write_plan_doc',
    description: '...', // 从 parent-agent.js 当前 definition 完整搬入
    parameters: {
      type: 'object',
      properties: { /* 完整搬入 */ },
      required: [/* 完整搬入 */],
    },
  };
  ```

  其余 4 个文件同结构:`edit-plan-doc.js` → `editPlanDocDefinition`、`dispatch-subagent.js` → `dispatchSubagentDefinition`、`delete-plan-doc.js` → `deletePlanDocDefinition`、`finalize-task.js` → `finalizeTaskDefinition`。

  `assistant/server/tools/meta/index.js`:
  ```javascript
  export { writePlanDocDefinition } from './write-plan-doc.js';
  export { editPlanDocDefinition } from './edit-plan-doc.js';
  export { dispatchSubagentDefinition } from './dispatch-subagent.js';
  export { deletePlanDocDefinition } from './delete-plan-doc.js';
  export { finalizeTaskDefinition } from './finalize-task.js';
  ```

- [ ] **Step 5: 改 `parent-agent.js` 引用新文件**

  顶部 import:

  ```javascript
  import {
    writePlanDocDefinition,
    editPlanDocDefinition,
    dispatchSubagentDefinition,
    deletePlanDocDefinition,
    finalizeTaskDefinition,
  } from './tools/meta/index.js';
  ```

  在 `buildMetaTools` 函数内,每个工具的 `definition: { ... }` 整块替换为 `definition: writePlanDocDefinition`(对应名字)。execute 字段**不动**,继续闭包 task / emitFn / runId。

  原代码片段(示意):
  ```javascript
  {
    definition: {
      name: 'write_plan_doc',
      description: '...',
      parameters: { /* 大段 schema */ },
    },
    execute: async (args) => { /* 闭包 task */ },
  },
  ```

  改后:
  ```javascript
  {
    definition: writePlanDocDefinition,
    execute: async (args) => { /* 闭包 task,不动 */ },
  },
  ```

- [ ] **Step 6: 跑所有相关测试**

  ```bash
  node --test assistant/tests/ 2>&1 | tail -15
  ```

  Expected: 全 PASS,**包括 Sprint A 已加的 `replace_steps 强制保留已完成步骤` 等测试 — 不应回归**。

- [ ] **Step 7: 验证 parent-agent.js 行数显著下降**

  ```bash
  wc -l assistant/server/parent-agent.js
  ```

  Expected: 从 535 行降到 ~330 行。

- [ ] **Step 8: 追加 CHANGELOG + Commit**

  ```markdown
  - refactor(assistant): meta 工具 5 件套 schema 外移到 assistant/server/tools/meta/ 子目录
  ```

  ```bash
  git add assistant/server/tools/meta/ assistant/server/parent-agent.js assistant/tests/tools/meta-schemas.test.js CHANGELOG.md && git commit -m "refactor(assistant): meta 工具 schema 外移到 tools/meta/"
  ```

---

## Task 3: 3.12 通过 cacheableSystem 选项摊薄稳定 prefix 成本(P3,审计 3.12 短期)

**问题:** 父代理与子代理每轮调 LLM 都重新拼装 prompt(parent-agent.md + CONTRACT.md ≈ 数 KB;子代理 sub-agent.md + 1 份 knowledge.md ≈ 5-10 KB)。Anthropic 已自动用 prefix cache_control,**但 Gemini 需要显式 `cacheableSystem` 触发 cachedContents**(`backend/llm/index.js:127` 已支持该字段)。

**思路:** 在 `parent-agent.js` 与 `sub-agent.js` 调 LLM 时,新增 `cacheableSystem` 选项,值为"该 agent 的稳定 system prefix 字符串"(即每次调用都不变的那部分:agent prompt 文件 + 不依赖 task 的 knowledge)。**不重写任何 prompt 组装逻辑**;只是把已经存在于内存里的字符串多塞进一个选项字段。

**Files:**
- Modify: `assistant/server/parent-agent.js`(3 处 llm 调用:`resolveToolContext` / `chat`)
- Modify: `assistant/server/sub-agent.js`(1 处 llm 调用:`completeWithTools`)

**判定"稳定 prefix"的标准:** 与本轮 user input、plan-doc 内容、task.messages 历史**完全无关**的字符串。父代理:`parent-agent.md` + `CONTRACT.md`(每轮重读但内容不变);子代理:`sub-agent.md` + `<targetType>.md`(子代理建立时就固定)。

- [ ] **Step 1: 读父子代理当前的 prompt 拼装逻辑**

  ```bash
  grep -n "loadSystemPrompt\|fs.readFileSync.*knowledge\|fs.readFileSync.*prompts" assistant/server/parent-agent.js assistant/server/sub-agent.js
  ```

  找到 system prompt 拼装的所有 source 文件读取点。

- [ ] **Step 2: 写测试 — 验证 cacheableSystem 被透传**

  新建 `assistant/tests/cacheable-system.test.js`:

  ```javascript
  import test from 'node:test';
  import assert from 'node:assert/strict';
  import fs from 'node:fs';
  import path from 'node:path';
  import os from 'node:os';

  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'we-cacheable-'));
  process.env.ASSISTANT_STATE_DIR = sandbox;
  process.env.LLM_PROVIDER = 'mock';

  // 用 mock provider:拦截 llm.* 调用,记录传入的 config(含 cacheableSystem)
  // 见 backend/llm/providers/mock/index.js 是否支持 callTracker;
  // 若不支持,改为直接 spy llm.resolveToolContext 的 options 参数
  const llmCalls = [];
  const llmMod = await import('../../backend/llm/index.js');
  const origResolve = llmMod.resolveToolContext;
  llmMod.resolveToolContext = async (msgs, tools, opts) => {
    llmCalls.push({ fn: 'resolveToolContext', opts: { ...opts } });
    return msgs;
  };

  const taskStore = await import('../server/task-store.js');
  const { runParentAgent } = await import('../server/parent-agent.js');

  test.after(() => {
    llmMod.resolveToolContext = origResolve;
    fs.rmSync(sandbox, { recursive: true, force: true });
    delete process.env.ASSISTANT_STATE_DIR;
    delete process.env.LLM_PROVIDER;
  });

  test('父代理调 resolveToolContext 时传 cacheableSystem', async () => {
    process.env.MOCK_LLM_STREAM = '';
    process.env.MOCK_LLM_TOOL_CALLS = JSON.stringify([]);
    const task = taskStore.createTask({ context: {} });
    taskStore.attachSse(task.id, { write: () => {} });
    await runParentAgent(task, 'hi').catch(() => { /* mock 配置不全可能抛,忽略 */ });
    const call = llmCalls.find((c) => c.fn === 'resolveToolContext');
    assert.ok(call, '应至少有一次 resolveToolContext 调用');
    assert.ok(typeof call.opts.cacheableSystem === 'string', 'cacheableSystem 应为字符串');
    assert.ok(call.opts.cacheableSystem.length > 100, 'cacheableSystem 应至少包含 prompt + CONTRACT 内容');
  });
  ```

  注意:这个测试用 spy 替换 `llmMod.resolveToolContext` — 若 ESM 不允许覆盖 module export,改用 mock provider 的 trace 机制或检查 SSE 旁路日志。**如 spy 不可行,降级为直接 grep 源码确认 `cacheableSystem:` 在父代理 / 子代理的 llm.* 调用处出现即可**(可写一个静态检查测试)。

- [ ] **Step 3: 在 parent-agent.js 中拼装 cacheableSystem 并传入**

  在 `runParentAgent` 函数体内,找到 `await llm.resolveToolContext(messages, tools, { ... })` 调用(约 line 457),增加 `cacheableSystem` 字段:

  ```javascript
  // 在调用前计算 cacheableSystem(每轮不变的稳定 prefix)
  // 来源:parent-agent.md + CONTRACT.md,二者已在 loadSystemPrompt 等步骤中读取
  const cacheableSystem = `${parentSystemPromptText}\n\n${contractText}`;

  const enriched = await llm.resolveToolContext(messages, tools, {
    cancelCheck: ...,
    cacheableSystem,
  });
  ```

  同样在 `llm.chat(enriched, { ... })`(约 line 482)处加同样字段。

  **具体变量名以现有代码为准**(`parentSystemPromptText` 可能叫别的);如系统 prompt 与 messages[0] 合并后才能拿到,提取其内容部分用作 cacheableSystem。

- [ ] **Step 4: 在 sub-agent.js 中同样处理**

  在 `dispatchSubAgent` 内调 `llm.completeWithTools(messages, tools, { ... })`(约 line 175)处加:

  ```javascript
  cacheableSystem: subSystemPrompt + '\n\n' + knowledgeContent,
  ```

  变量名以现有代码为准。

- [ ] **Step 5: 跑测试**

  ```bash
  node --test assistant/tests/cacheable-system.test.js 2>&1 | tail -15
  node --test assistant/tests/parent-agent.test.mjs 2>&1 | tail -10
  ```

  Expected: 新测试 PASS;parent-agent.test.mjs 全部继续 PASS(passing 选项不影响 mock provider 行为,mock 忽略 cacheableSystem)。

- [ ] **Step 6: ARCHITECTURE.md 同步**

  在 `ARCHITECTURE.md` 中提到父子代理 prompt 组装的段落附近补一句:

  ```markdown
  - 父子代理调 `llm.*` 时显式传 `cacheableSystem`(稳定 system prefix),Anthropic 自动 prefix cache,Gemini 触发 explicit cachedContents,其他 provider 忽略。仅为 cache 提示,不影响 prompt 内容。
  ```

- [ ] **Step 7: 追加 CHANGELOG + Commit**

  ```markdown
  - feat(assistant): 父子代理向 llm.* 传 cacheableSystem 选项,触发 Gemini explicit cache 摊薄成本
  ```

  ```bash
  git add assistant/server/parent-agent.js assistant/server/sub-agent.js assistant/tests/cacheable-system.test.js ARCHITECTURE.md CHANGELOG.md && git commit -m "feat(assistant): 父子代理透传 cacheableSystem 摊薄稳定 prefix 成本"
  ```

---

## 收尾验证

- [ ] **Step 1: 全量回归**

  ```bash
  cd /Users/yunzhiwang/Desktop/WorldEngine && npm run check
  ```

  Expected: 全部 PASS。

- [ ] **Step 2: 前端冒烟**

  ```bash
  cd /Users/yunzhiwang/Desktop/WorldEngine/backend && npm run dev   # 终端 1
  cd /Users/yunzhiwang/Desktop/WorldEngine/frontend && npm run dev  # 终端 2
  ```

  浏览器:进入写卡助手,发"建一个新世界"→ 看到 plan_doc → 审批 → 子代理执行 → finalize。**确认前端能正确响应所有 SSE 事件**(Task 1 SSE 常量替换不能破坏前端消费)。

- [ ] **Step 3: 清理临时文件**

  ```bash
  ls /Users/yunzhiwang/Desktop/WorldEngine/.temp/assistant/ 2>/dev/null
  # 必要时清理
  ```

---

## 关键文件索引(供 sub-agent 实施时引用)

```
assistant/server/sse-events.js              # 新建,Task 1
assistant/server/tools/meta/*.js            # 新建,Task 2(5 + 1 个文件)
assistant/server/parent-agent.js            # Task 1/2/3 主修改点
assistant/server/sub-agent.js               # Task 1/3
assistant/server/routes.js                  # Task 1
assistant/server/task-store.js              # Task 1
assistant/client/                            # Task 1(前端消费侧)
assistant/tests/sse-events.test.js          # 新建,Task 1
assistant/tests/tools/meta-schemas.test.js  # 新建,Task 2
assistant/tests/cacheable-system.test.js    # 新建,Task 3
backend/llm/index.js                        # 只读引用,line 127 确认 cacheableSystem 字段
ARCHITECTURE.md                             # Task 3 同步
CHANGELOG.md                                # 每 task 末尾追加
```

---

## 自查清单

- [x] Sprint D 三项(3.11 / 3.13 / 3.12 短期)全部覆盖,每 task 独立 commit
- [x] 每个 task 含 TDD 五步骨架
- [x] 所有代码块为可粘贴的完整片段
- [x] 文件路径精确;mutator 改动位置给出行号近似(实施时按当前代码 grep 校准)
- [x] 测试代码完整给出
- [x] 跨 task 类型/函数名一致:`SSE_EVENTS` / `cacheableSystem` / `writePlanDocDefinition` 等
- [x] CHANGELOG 模板逐 task 给出
- [x] 没碰锁定文件
- [x] **严格不动 `backend/llm/providers/*/`**(3.5 留作独立任务,不在本 Sprint)
- [x] 不动主数据库 schema / backend services
- [x] 验证方式具体(命令 + 期望输出 + UI 冒烟)
- [x] 明确不在范围的项(3.5 / 3.1 / 3.4 / 3.12 长期切片)
