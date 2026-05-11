# 写卡助手 Harness Sprint D 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地体检报告(`/Users/yunzhiwang/.claude/plans/assistant-harness-agent-harness-enginee-jiggly-lighthouse.md`)中 Sprint D 四项:(3.11) SSE 事件类型集中常量、(3.13) Meta 工具 5 件套 schema 外移、(3.12) Knowledge / 稳定 system prefix 通过 `cacheableSystem` 选项透传摊薄 Gemini explicit cache 成本、(3.5) tool loop provider-agnostic 抽象 **覆盖所有 4 个 provider**(anthropic / gemini / ollama / openai-compatible)。Task 1-3 在 `assistant/` 内;Task 4-7 触达 `backend/llm/`,显式打破"严格限定 assistant/"边界(已与用户对齐)。

**Architecture:**
- Task 1(3.11):新增 `assistant/server/sse-events.js` 导出常量对象 `SSE_EVENTS = { TASK_CREATED: 'task_created', ... }`,把 4 处现存 emit 调用从字符串字面替换为常量引用;前端 `AssistantPanel` 同步消费(共享常量通过 ESM import,不复制定义)。
- Task 2(3.13):把 `parent-agent.js` 中 5 件套 meta 工具的 `definition`(schema 部分,约 400 行)外移到 `assistant/server/tools/meta/<name>.js`,每个文件导出 `definition`;`buildMetaTools` 仍闭包 `task` / `emitFn` / `runId` 在 parent-agent.js 内拼接 execute。execute 函数体不动。
- Task 3(3.12):`assistant/server/parent-agent.js` 与 `sub-agent.js` 在调 `llm.resolveToolContext` / `llm.completeWithTools` / `llm.chat` 时新增 `cacheableSystem` 选项,值为"该 agent 当前的稳定 system prefix"(父:parent-agent.md + CONTRACT.md;子:sub-agent.md + 当前 targetType 的 knowledge.md)。`backend/llm/index.js:127` 已支持此选项,Anthropic/Ollama/OpenAI 忽略,Gemini 触发 explicit cachedContents。**只是把已存在的字符串多塞进一个选项,不重写任何 prompt 组装逻辑**。
- Task 4-7(3.5):把 `for(i<25) {…}` 工具循环骨架抽到 `backend/llm/tool-loop-control.js`,导出 `runToolLoop({ provider, messages, toolDefs, toolHandlers, config, mode })`(mode='complete' | 'resolve');每个 provider 改为只暴露 4 个原语 — `initState(messages)` / `oneTurn(state, defs, mode, iter, config)` / `appendToolTurn(state, calls, results)` / `completeNoTools(state, config)`,内部不再写循环。Task 4 建骨架 + Anthropic 迁移;Task 5/6/7 分别迁 Gemini / Ollama / OpenAI-compat,每 provider 单独 commit 控制 blast radius。验证:每 task 后跑相应 provider 的 backend 测试 + assistant 集成测全 PASS。

**Tech Stack:** Node.js ESM、React(前端共享常量)、node:test、4 个 LLM provider(Task 4-7 各自迁移)。

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
- **Task 4-7 显式允许改 `backend/llm/tool-loop-control.js` 与 `backend/llm/providers/*/index.js`**(4 个 provider)
- 直接 commit 到 main 分支(用户偏好,无 PR)
- 测试通过 `npm run check`(lint + 前后端 + assistant 单测);Task 4-7 每次都需跑 `backend/tests/llm/` 全套 + assistant 集成测

**不在本 Sprint 范围:**
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

## Task 4: 3.5 建立 runToolLoop 骨架 + 迁移 Anthropic(P1,审计 3.5)

**问题:** 体检报告 3.5:`resolveToolContext` / `completeWithTools` 的工具循环逻辑在 4 个 provider 中各写一遍(~80 行 × 8 处 ≈ 600 行重复骨架),cancel 信号 / max-iter 上限 / cache_control / 错误降级等任何修改都要 ×4,容易漂移。

**思路(provider 原语接口):**

`backend/llm/tool-loop-control.js` 暴露 `runToolLoop({ provider, ... })`。provider 不再写 `for` 循环,只暴露 4 个原语:

```typescript
interface ToolLoopProvider {
  // 把 OpenAI 格式 messages 初始化为 provider 内部 state(对 Anthropic 是直接拷贝;对 Gemini 是转 nativeContents)
  initState(messages: Message[]): State;

  // 跑一轮 LLM 调用;mode='complete'|'resolve' 影响首轮 config 覆盖、终态返回类型
  // iter 用于 provider 决定是否首轮(max_tokens=1000 + temperature=0)
  // 返回:
  //   { kind: 'text', text }                          模型给纯文本 → 终态
  //   { kind: 'tools', toolCalls, assistantBlock }    模型要调工具 → 继续
  //   { kind: 'fallback' }                            400/422 → 退到 completeNoTools
  oneTurn(state: State, defs, mode, iter, config): Promise<TurnResult>;

  // 把本轮 assistant block + tool results 写回 state(provider 决定写 native 还是 OpenAI 格式)
  appendToolTurn(state: State, calls, results): State;

  // 25 轮兜底 / fallback 时跑无工具版本,返回文本
  completeNoTools(state: State, config): Promise<string>;

  // 仅 mode='resolve' 终态需要:把 state 还原成 OpenAI 格式 messages 返回给 assistant
  stateToMessages?(state: State): Message[];
}
```

**`runToolLoop` 骨架伪代码:**

```javascript
export async function runToolLoop({
  provider, messages, toolDefs, toolHandlers, config,
  mode = 'complete',  // 'complete' → 返回 string;'resolve' → 返回 Message[]
  maxIterations = LLM_TOOL_RESOLUTION_MAX_ITERATIONS,
}) {
  let state = provider.initState(messages);
  let enriched = false;

  for (let i = 0; i < maxIterations; i++) {
    const turn = await provider.oneTurn(state, toolDefs, mode, i, config);

    if (turn.kind === 'text') {
      return mode === 'complete'
        ? turn.text
        : (enriched ? provider.stateToMessages(state) : messages);
    }
    if (turn.kind === 'fallback') {
      return mode === 'complete'
        ? await provider.completeNoTools(state, config)
        : (enriched ? provider.stateToMessages(state) : messages);
    }
    // turn.kind === 'tools'
    const results = [];
    for (const call of turn.toolCalls) {
      const fn = toolHandlers[call.name];
      try {
        results.push(fn ? String(await fn(call.args)) : `工具未定义:${call.name}`);
      } catch (err) {
        if (isToolLoopCancelledError(err)) throw err;
        results.push(`工具执行失败:${err.message}`);
      }
    }
    state = provider.appendToolTurn(state, turn, results);
    enriched = true;
  }

  // 25 轮兜底
  return mode === 'complete'
    ? await provider.completeNoTools(state, config)
    : (enriched ? provider.stateToMessages(state) : messages);
}
```

**Files (Task 4):**
- Modify: `backend/llm/tool-loop-control.js`(从 10 行扩到 ~80 行,加 `runToolLoop`)
- Modify: `backend/llm/providers/anthropic/index.js`(删除两份循环,改为暴露 4 个原语 + 两个薄包装函数)
- Test: `backend/tests/llm/tool-loop-control.test.js`(新建,纯 loop 骨架单测,用 fake provider)
- 不动:gemini / ollama / openai-compat(Task 5/6/7 各自迁)

- [ ] **Step 1: 写 runToolLoop 骨架单测(fake provider)**

  新建 `backend/tests/llm/tool-loop-control.test.js`:

  ```javascript
  import test from 'node:test';
  import assert from 'node:assert/strict';
  import { runToolLoop, ToolLoopCancelledError, isToolLoopCancelledError } from '../../llm/tool-loop-control.js';

  function fakeProvider(turns) {
    // turns: 数组,每项是 oneTurn 应返回的 TurnResult
    let i = 0;
    return {
      initState: (messages) => ({ messages: [...messages] }),
      oneTurn: async () => turns[i++] ?? { kind: 'text', text: 'fallback-text' },
      // appendToolTurn 收到完整 turn,可读 turn.assistantBlock / turn.toolCalls / 自定义字段
      appendToolTurn: (state, turn, results) => ({
        ...state,
        messages: [...state.messages,
          turn.assistantBlock ?? { role: 'assistant', tool_calls: turn.toolCalls },
          ...results.map((r, k) => ({ role: 'tool', tool_call_id: turn.toolCalls[k].id, content: r }))],
      }),
      completeNoTools: async () => 'fallback-no-tools',
      stateToMessages: (state) => state.messages,
    };
  }

  test('runToolLoop: 首轮就返回 text → 直接结束', async () => {
    const result = await runToolLoop({
      provider: fakeProvider([{ kind: 'text', text: 'hello' }]),
      messages: [{ role: 'user', content: 'hi' }],
      toolDefs: [],
      toolHandlers: {},
      config: {},
      mode: 'complete',
    });
    assert.equal(result, 'hello');
  });

  test('runToolLoop: 工具调用 → 二轮文本', async () => {
    const handlers = { add: async ({ a, b }) => String(a + b) };
    const result = await runToolLoop({
      provider: fakeProvider([
        { kind: 'tools', toolCalls: [{ id: 'c1', name: 'add', args: { a: 1, b: 2 } }] },
        { kind: 'text', text: 'done=3' },
      ]),
      messages: [{ role: 'user', content: 'calc' }],
      toolDefs: [],
      toolHandlers: handlers,
      config: {},
      mode: 'complete',
    });
    assert.equal(result, 'done=3');
  });

  test('runToolLoop: cancel 信号透传(handler 抛 ToolLoopCancelledError)', async () => {
    const handlers = { x: async () => { throw new ToolLoopCancelledError('cancel'); } };
    await assert.rejects(() => runToolLoop({
      provider: fakeProvider([
        { kind: 'tools', toolCalls: [{ id: 'c1', name: 'x', args: {} }] },
      ]),
      messages: [{ role: 'user', content: 'go' }],
      toolDefs: [],
      toolHandlers: handlers,
      config: {},
      mode: 'complete',
    }), ToolLoopCancelledError);
  });

  test('runToolLoop: 工具普通 error 被字符串化喂回模型,不抛', async () => {
    const handlers = { x: async () => { throw new Error('boom'); } };
    const result = await runToolLoop({
      provider: fakeProvider([
        { kind: 'tools', toolCalls: [{ id: 'c1', name: 'x', args: {} }] },
        { kind: 'text', text: 'recovered' },
      ]),
      messages: [{ role: 'user', content: 'go' }],
      toolDefs: [],
      toolHandlers: handlers,
      config: {},
      mode: 'complete',
    });
    assert.equal(result, 'recovered');
  });

  test('runToolLoop: kind=fallback 走 completeNoTools', async () => {
    const result = await runToolLoop({
      provider: fakeProvider([{ kind: 'fallback' }]),
      messages: [{ role: 'user', content: 'go' }],
      toolDefs: [],
      toolHandlers: {},
      config: {},
      mode: 'complete',
    });
    assert.equal(result, 'fallback-no-tools');
  });

  test('runToolLoop: 超 maxIterations 兜底 completeNoTools', async () => {
    const turns = Array.from({ length: 30 }, () =>
      ({ kind: 'tools', toolCalls: [{ id: 'c', name: 'noop', args: {} }] }));
    const handlers = { noop: async () => 'ok' };
    const result = await runToolLoop({
      provider: fakeProvider(turns),
      messages: [],
      toolDefs: [],
      toolHandlers: handlers,
      config: {},
      mode: 'complete',
      maxIterations: 3,
    });
    assert.equal(result, 'fallback-no-tools');
  });

  test('runToolLoop: mode=resolve 终态返回 enriched messages', async () => {
    const handlers = { add: async () => '3' };
    const result = await runToolLoop({
      provider: fakeProvider([
        { kind: 'tools', toolCalls: [{ id: 'c1', name: 'add', args: {} }] },
        { kind: 'text', text: 'final' },
      ]),
      messages: [{ role: 'user', content: 'go' }],
      toolDefs: [],
      toolHandlers: handlers,
      config: {},
      mode: 'resolve',
    });
    assert.ok(Array.isArray(result));
    assert.ok(result.length > 1, 'enriched 应该比原 messages 长');
  });

  test('runToolLoop: mode=resolve 且首轮 text → 返回原 messages(未 enriched)', async () => {
    const original = [{ role: 'user', content: 'go' }];
    const result = await runToolLoop({
      provider: fakeProvider([{ kind: 'text', text: 'no-tools-needed' }]),
      messages: original,
      toolDefs: [],
      toolHandlers: {},
      config: {},
      mode: 'resolve',
    });
    assert.equal(result, original);  // 引用相等
  });

  test('isToolLoopCancelledError 识别错误', () => {
    assert.equal(isToolLoopCancelledError(new ToolLoopCancelledError()), true);
    assert.equal(isToolLoopCancelledError(new Error('other')), false);
  });
  ```

- [ ] **Step 2: 跑测试确认失败**

  ```bash
  cd /Users/yunzhiwang/Desktop/WorldEngine && node --test backend/tests/llm/tool-loop-control.test.js 2>&1 | tail -10
  ```

  Expected: FAIL — `runToolLoop` not exported。

- [ ] **Step 3: 实现 `tool-loop-control.js`**

  完整替换 `backend/llm/tool-loop-control.js`:

  ```javascript
  // backend/llm/tool-loop-control.js
  //
  // Provider-agnostic 工具循环骨架。所有 LLM provider 通过暴露 4 个原语接入此循环。
  // 不要在 provider 内再写 for (i < 25) {...} 工具循环。

  import { LLM_TOOL_RESOLUTION_MAX_ITERATIONS } from '../utils/constants.js';

  export class ToolLoopCancelledError extends Error {
    constructor(message = 'tool loop cancelled') {
      super(message);
      this.name = 'ToolLoopCancelledError';
    }
  }

  export function isToolLoopCancelledError(err) {
    return err instanceof ToolLoopCancelledError || err?.name === 'ToolLoopCancelledError';
  }

  /**
   * @param {Object} opts
   * @param {ToolLoopProvider} opts.provider  - 暴露 initState/oneTurn/appendToolTurn/completeNoTools(可选 stateToMessages)
   * @param {Array} opts.messages              - 初始 OpenAI 格式 messages
   * @param {Array} opts.toolDefs              - provider-native tool 定义(由调用方提前转换)
   * @param {Object} opts.toolHandlers         - { toolName: async (args) => string | any }
   * @param {Object} opts.config               - LLM config 透传
   * @param {'complete'|'resolve'} [opts.mode] - 'complete' 返回最终文本;'resolve' 返回 enriched messages
   * @param {number} [opts.maxIterations]      - 默认 LLM_TOOL_RESOLUTION_MAX_ITERATIONS
   * @returns {Promise<string|Array>}
   */
  export async function runToolLoop({
    provider,
    messages,
    toolDefs,
    toolHandlers,
    config,
    mode = 'complete',
    maxIterations = LLM_TOOL_RESOLUTION_MAX_ITERATIONS,
  }) {
    let state = provider.initState(messages);
    let enriched = false;

    for (let i = 0; i < maxIterations; i++) {
      const turn = await provider.oneTurn(state, toolDefs, mode, i, config);

      if (turn.kind === 'text') {
        if (mode === 'complete') return turn.text;
        return enriched ? provider.stateToMessages(state) : messages;
      }
      if (turn.kind === 'fallback') {
        if (mode === 'complete') return await provider.completeNoTools(state, config);
        return enriched ? provider.stateToMessages(state) : messages;
      }

      // turn.kind === 'tools'
      const results = [];
      for (const call of turn.toolCalls) {
        const fn = toolHandlers[call.name];
        let result;
        try {
          result = fn ? String(await fn(call.args ?? {})) : `工具未定义:${call.name}`;
        } catch (err) {
          if (isToolLoopCancelledError(err)) throw err;
          result = `工具执行失败:${err.message}`;
        }
        results.push(result);
      }
      state = provider.appendToolTurn(state, turn.toolCalls, results);
      enriched = true;
    }

    // 超 maxIterations 兜底
    if (mode === 'complete') return await provider.completeNoTools(state, config);
    return enriched ? provider.stateToMessages(state) : messages;
  }
  ```

- [ ] **Step 4: 跑骨架测试通过**

  ```bash
  node --test backend/tests/llm/tool-loop-control.test.js 2>&1 | tail -10
  ```

  Expected: 9 个测试全 PASS。

- [ ] **Step 5: 迁移 Anthropic provider**

  在 `backend/llm/providers/anthropic/index.js` 中:

  (a) 在文件顶部 import `runToolLoop`:
  ```javascript
  import { runToolLoop, isToolLoopCancelledError } from '../../tool-loop-control.js';
  ```

  (b) 新增 4 个原语函数(放在 `completeAnthropicWithTools` 函数之前):

  ```javascript
  // ─── tool loop primitives for runToolLoop ──────────────────────────
  const anthropicToolLoopProvider = {
    initState(messages) {
      // Anthropic 内部就用 OpenAI 格式 messages,转换在 oneTurn 内做
      return { messages: [...messages] };
    },

    async oneTurn(state, toolDefs, mode, iter, config) {
      const baseUrl = getBaseUrl(config);
      const url = `${baseUrl}/v1/messages`;
      const headers = {
        'Content-Type': 'application/json',
        'x-api-key': config.api_key,
        'anthropic-version': ANTHROPIC_API_VERSION,
        'anthropic-beta': ANTHROPIC_PROMPT_CACHING_BETA,
      };
      const { system, messages: anthropicMsgs } = convertToAnthropicMessages(state.messages);
      const body = {
        model: config.model,
        messages: anthropicMsgs,
        tools: toolDefs,
        // resolve 模式首轮限 1000 tokens + temperature=0(对齐原 resolveToolContextAnthropic 行为)
        max_tokens: mode === 'resolve' && iter === 0 ? 1000 : (config.max_tokens || 4096),
      };
      if (mode === 'resolve') body.temperature = 0;
      else if (config.temperature != null) body.temperature = config.temperature;
      if (system) body.system = withCacheControl(system, config);

      logRawRequest(body, config, config.callType ? `${config.callType}:${mode}` : `${mode}-tools`);
      const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: config.signal });
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        log.error('provider.http_error', formatMeta({ provider: 'anthropic', status: resp.status, msg: text }));
        if (resp.status === 400 || resp.status === 422) return { kind: 'fallback' };
        throw apiError(`Anthropic API error: ${resp.status} ${text}`, resp.status);
      }

      const data = await resp.json();
      if (data.usage) {
        logUsage(config.model, data.usage);
        if (config.usageRef) recordTokenUsage(config.usageRef, data.usage, config.provider);
      }
      const content = data.content || [];
      const toolUseBlocks = content.filter((b) => b.type === 'tool_use');
      const textContent = content.filter((b) => b.type === 'text').map((b) => b.text).join('');

      if (!toolUseBlocks.length) return { kind: 'text', text: textContent };

      const toolCalls = toolUseBlocks.map((b) => ({ id: b.id, name: b.name, args: b.input }));
      const assistantBlock = {
        role: 'assistant',
        content: textContent || null,
        tool_calls: toolUseBlocks.map((b) => ({
          id: b.id, type: 'function',
          function: { name: b.name, arguments: JSON.stringify(b.input) },
        })),
      };
      return { kind: 'tools', toolCalls, assistantBlock };
    },

    appendToolTurn(state, turn, results) {
      // runToolLoop 把整个 turn 透传过来,直接复用 oneTurn 构造的 assistantBlock(含 textContent)
      const toolMsgs = turn.toolCalls.map((c, i) => ({ role: 'tool', tool_call_id: c.id, content: results[i] }));
      return { messages: [...state.messages, turn.assistantBlock, ...toolMsgs] };
    },

    async completeNoTools(state, config) {
      return await completeAnthropic(state.messages, config);
    },

    stateToMessages(state) {
      return state.messages;
    },
  };
  ```

  (c) 重写 `completeAnthropicWithTools` 和 `resolveToolContextAnthropic` 为薄包装,删除内联循环:

  ```javascript
  export async function completeAnthropicWithTools(messages, toolDefs, toolHandlers, config) {
    log.debug('provider.request', formatMeta({ provider: 'anthropic', model: config.model, msgs: messages.length, mode: 'complete-tools' }));
    return await runToolLoop({
      provider: anthropicToolLoopProvider,
      messages,
      toolDefs: toAnthropicTools(toolDefs),
      toolHandlers,
      config,
      mode: 'complete',
    });
  }

  export async function resolveToolContextAnthropic(messages, toolDefs, toolHandlers, config) {
    log.debug('provider.request', formatMeta({ provider: 'anthropic', model: config.model, msgs: messages.length, mode: 'resolve-tools' }));
    return await runToolLoop({
      provider: anthropicToolLoopProvider,
      messages,
      toolDefs: toAnthropicTools(toolDefs),
      toolHandlers,
      config,
      mode: 'resolve',
    });
  }
  ```

- [ ] **Step 6: 跑 Anthropic 全部测试 + assistant 集成测**

  ```bash
  node --test backend/tests/llm/tool-loop-control.test.js \
              backend/tests/llm/anthropic-tool-loop-cancel.test.js \
              backend/tests/llm/cache-usage.test.js \
              backend/tests/llm/complete-with-tools-cancel.test.js \
              backend/tests/llm/index.test.js 2>&1 | tail -20
  node --test assistant/tests/parent-agent.test.mjs 2>&1 | tail -10
  ```

  Expected: 全 PASS。

  特别关注:
  - `anthropic-tool-loop-cancel.test.js` 应能验证 cancel 透传(Sprint A `dc6d6c0` 修复过)
  - `cache-usage.test.js` 应验证 cache_control 仍按预期注入(via `withCacheControl`)

- [ ] **Step 7: 验证 anthropic 文件 LOC 显著下降**

  ```bash
  wc -l backend/llm/providers/anthropic/index.js
  ```

  Expected: 从 288 行降到约 200 行(净减 ~80 行重复循环)。

- [ ] **Step 8: CHANGELOG + Commit**

  ```markdown
  - refactor(llm): tool-loop-control.js 暴露 runToolLoop 骨架;Anthropic provider 迁移到 4 原语接口
  ```

  ```bash
  git add backend/llm/tool-loop-control.js backend/llm/providers/anthropic/index.js backend/tests/llm/tool-loop-control.test.js CHANGELOG.md && git commit -m "refactor(llm): runToolLoop 骨架 + Anthropic 迁移到 4 原语"
  ```

---

## Task 5: 3.5 迁移 Gemini provider

**特殊性:** Gemini 必须保留 `thought_signature`(在 native `parts` 里),OpenAI 格式 ↔ Gemini 格式往返会丢失。原代码用 `nativeContents` 数组并行维护,通过 `_geminiParts` 字段在 OpenAI 消息上挂载原始 parts。

**Files:**
- Modify: `backend/llm/providers/gemini/index.js`

- [ ] **Step 1: 设计 Gemini state**

  Gemini state 不能只放 OpenAI messages,还需 nativeContents 与 systemInstruction:

  ```javascript
  initState(messages) {
    const { contents, systemInstruction } = convertToGeminiContents(messages);
    return {
      messages: [...messages],
      nativeContents: [...contents],
      systemInstruction,
    };
  }
  ```

- [ ] **Step 2: 实现 `oneTurn`**

  内部用 `state.nativeContents` 而不是 messages 构造请求(保留 thought_signature)。返回 `{ kind, ..., _rawParts }`(把模型返回的 parts 数组保留,用于后续 appendToolTurn 加回 nativeContents)。

  关键参数:`generationConfig.maxOutputTokens = mode === 'resolve' && iter === 0 ? 1000 : config.max_tokens`;`generationConfig.temperature = mode === 'resolve' ? 0 : config.temperature`。

- [ ] **Step 3: 实现 `appendToolTurn`**

  ```javascript
  appendToolTurn(state, turn, results) {
    // turn._rawParts: 原始 Gemini parts(含 thought_signature)
    const nextNative = [
      ...state.nativeContents,
      { role: 'model', parts: turn._rawParts },
      { role: 'user', parts: turn.toolCalls.map((c, i) => ({
        functionResponse: { name: c.name, response: { output: results[i] } },
      })) },
    ];
    // 同步维护 OpenAI 格式 messages 给 stateToMessages 用
    const assistantMsg = {
      role: 'assistant',
      content: turn._textContent || null,
      tool_calls: turn.toolCalls.map((c) => ({
        id: c.id, type: 'function',
        function: { name: c.name, arguments: JSON.stringify(c.args) },
      })),
      _geminiParts: turn._rawParts,
    };
    const toolMsgs = turn.toolCalls.map((c, i) => ({ role: 'tool', tool_call_id: c.id, content: results[i] }));
    return {
      ...state,
      nativeContents: nextNative,
      messages: [...state.messages, assistantMsg, ...toolMsgs],
    };
  }
  ```

- [ ] **Step 4: 实现 `completeNoTools`**

  ```javascript
  async completeNoTools(state, config) {
    return await completeGeminiFromNative(state.nativeContents, state.systemInstruction, config);
  }
  ```

- [ ] **Step 5: 把 `completeGeminiWithTools` / `resolveToolContextGemini` 改为薄包装**

  同 Anthropic Step 5(c)。

- [ ] **Step 6: 跑 Gemini 测试 + assistant 集成测**

  ```bash
  node --test backend/tests/llm/ assistant/tests/parent-agent.test.mjs 2>&1 | tail -20
  ```

  Expected: 全 PASS。注意:gemini 单测可能稀薄,若发现 nothing-tests-gemini-tool-loop 的情况,**先停下报告**,不要硬迁。

- [ ] **Step 7: CHANGELOG + Commit**

  ```markdown
  - refactor(llm): Gemini provider 迁移到 runToolLoop 4 原语接口(保留 thought_signature)
  ```

  ```bash
  git add backend/llm/providers/gemini/index.js CHANGELOG.md && git commit -m "refactor(llm): Gemini 迁移到 runToolLoop 4 原语"
  ```

---

## Task 6: 3.5 迁移 Ollama provider

**特殊性:** Ollama 的 `callWithTools` 在 4xx 时返回 `null` 作为"降级信号",当前实现是 `if (!data) return complete(currentMessages, config)`(走非工具版本)。迁移后这等价于 `oneTurn` 返回 `{ kind: 'fallback' }`。

**Files:**
- Modify: `backend/llm/providers/ollama/index.js`

- [ ] **Step 1: 实现 4 原语**

  state 是 OpenAI 格式 messages 即可(Ollama 用 OpenAI-compat 协议)。`oneTurn` 内调 `callWithTools`:
  - 返回 null → `{ kind: 'fallback' }`
  - 无 tool_calls → `{ kind: 'text', text: message.content || '' }`
  - 有 tool_calls → `{ kind: 'tools', toolCalls: [...], assistantBlock: {...} }`

  `appendToolTurn`:push `turn.assistantBlock` + tool result messages。

  `completeNoTools`:调 `complete(state.messages, config)`。

- [ ] **Step 2: 把 `completeWithTools` / `resolveToolContext` 改为薄包装**

- [ ] **Step 3: 跑测试**

  ```bash
  node --test backend/tests/llm/ assistant/tests/parent-agent.test.mjs 2>&1 | tail -10
  ```

  Expected: 全 PASS。

- [ ] **Step 4: CHANGELOG + Commit**

  ```markdown
  - refactor(llm): Ollama provider 迁移到 runToolLoop 4 原语接口
  ```

  ```bash
  git add backend/llm/providers/ollama/index.js CHANGELOG.md && git commit -m "refactor(llm): Ollama 迁移到 runToolLoop 4 原语"
  ```

---

## Task 7: 3.5 迁移 OpenAI-compatible provider

**特殊性:** OpenAI-compat 有 `executeToolCall` 辅助函数和 `reasoning_content` 字段处理,迁移时要保留这些副细节。Resolve 模式与 complete 模式的请求头略有差异(`Authorization: Bearer ...` 在 resolve 中硬编码,而 complete 用 `buildOpenAICompatibleHeaders` — 这个不一致可在迁移时顺手统一为后者)。

**Files:**
- Modify: `backend/llm/providers/openai-compatible/index.js`

- [ ] **Step 1: 实现 4 原语**

  state 是 normalized OpenAI 格式 messages(用 `normalizeOpenAICompatibleMessages` 处理过)。`oneTurn` 调用 `chat/completions`,根据 mode 决定 `max_tokens` 与 `temperature`:

  ```javascript
  body.max_tokens = mode === 'resolve' && iter === 0 ? 1000 : config.max_tokens;
  if (thinkingState !== 'enabled') body.temperature = mode === 'resolve' ? (config.temperature ?? 0) : config.temperature;
  ```

  注意:**统一用 `buildOpenAICompatibleHeaders(config)`,不要重复硬编码 Authorization**(顺手清理 resolve 函数当前的偏差)。

  4xx 时返回 `{ kind: 'fallback' }`(与原代码 `if (resp.status === 400 || resp.status === 422)` 行为一致)。

  保留 `reasoning_content` 字段处理:在 `appendToolTurn` 中,如果 turn.assistantBlock 有 `reasoning_content`,透传。

- [ ] **Step 2: 把 `completeOpenAICompatibleWithTools` / `resolveToolContextOpenAI` 改为薄包装**

- [ ] **Step 3: 跑测试**

  ```bash
  node --test backend/tests/llm/openai-compatible-headers.test.js backend/tests/llm/ assistant/tests/parent-agent.test.mjs 2>&1 | tail -15
  ```

  Expected: 全 PASS。`openai-compatible-headers.test.js` 应能验证 Authorization 注入仍正确。

- [ ] **Step 4: CHANGELOG + Commit**

  ```markdown
  - refactor(llm): OpenAI-compatible provider 迁移到 runToolLoop 4 原语接口
  ```

  ```bash
  git add backend/llm/providers/openai-compatible/index.js CHANGELOG.md && git commit -m "refactor(llm): OpenAI-compatible 迁移到 runToolLoop 4 原语"
  ```

---

## Task 8(可选,Task 4-7 完成后跑):验证全 provider 一致性

跑全量回归并对比改动前后的代码减量:

```bash
cd /Users/yunzhiwang/Desktop/WorldEngine && npm run check
wc -l backend/llm/providers/*/index.js backend/llm/tool-loop-control.js
```

Expected:
- npm run check 全 PASS
- 4 个 provider 文件合计净减约 250-300 行(8 处重复循环骨架被替换为薄包装)
- `tool-loop-control.js` 从 10 行扩到 ~80 行

如有任何 provider 单测覆盖稀薄,在 CHANGELOG 备注"TODO:补 X provider 工具循环单测"。

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
backend/llm/index.js                        # Task 3 只读引用 line 127 确认 cacheableSystem 字段
backend/llm/tool-loop-control.js            # Task 4 重写(10 行 → ~80 行 runToolLoop 骨架)
backend/llm/providers/anthropic/index.js    # Task 4 迁移到 4 原语
backend/llm/providers/gemini/index.js       # Task 5 迁移到 4 原语(保留 thought_signature)
backend/llm/providers/ollama/index.js       # Task 6 迁移到 4 原语
backend/llm/providers/openai-compatible/index.js  # Task 7 迁移到 4 原语
backend/tests/llm/tool-loop-control.test.js # 新建,Task 4(骨架单测 + fake provider)
backend/tests/llm/anthropic-tool-loop-cancel.test.js  # Task 4 现有测试不破坏
backend/tests/llm/cache-usage.test.js       # Task 4 现有测试不破坏
backend/tests/llm/complete-with-tools-cancel.test.js # Task 4 现有测试不破坏
backend/tests/llm/openai-compatible-headers.test.js  # Task 7 现有测试不破坏
ARCHITECTURE.md                             # Task 3 同步
CHANGELOG.md                                # 每 task 末尾追加
```

---

## 自查清单

- [x] Sprint D 四项(3.11 / 3.13 / 3.12 短期 / 3.5 全 provider)全部覆盖,每 task 独立 commit
- [x] 每个 task 含 TDD 五步骨架
- [x] 所有代码块为可粘贴的完整片段
- [x] 文件路径精确;mutator 改动位置给出行号近似(实施时按当前代码 grep 校准)
- [x] 测试代码完整给出(尤其 Task 4 的 fake provider + 9 个骨架单测)
- [x] 跨 task 类型/函数名一致:`SSE_EVENTS` / `cacheableSystem` / `writePlanDocDefinition` / `runToolLoop` / `initState` / `oneTurn` / `appendToolTurn` / `completeNoTools` / `stateToMessages`
- [x] `appendToolTurn` 签名最终为 `(state, turn, results)` — 让 provider 可读 turn.assistantBlock(含 textContent / thought_signature 等)
- [x] CHANGELOG 模板逐 task 给出
- [x] 没碰锁定文件(SCHEMA.md / CLAUDE.md / schema.js / constants.js / assembler.js / store/index.js / server.js)
- [x] **Task 4-7 显式触达 `backend/llm/tool-loop-control.js` + 4 个 provider index.js**(已与用户对齐 Sprint D 范围)
- [x] 不动主数据库 schema / backend services / frontend(除 Task 1 SSE 常量消费)
- [x] 验证方式具体(命令 + 期望输出 + UI 冒烟 + Task 4-7 逐 provider 跑 backend/tests/llm/ 全套)
- [x] 明确不在范围的项(3.1 / 3.4 / 3.12 长期切片)
- [x] Task 5(Gemini)特别提示:thought_signature 必须保留;Task 7(OpenAI-compat)特别提示:顺手统一 Authorization 注入
