# WorldEngine — 开发路线图

## 使用方法

1. 按顺序找到第一个状态为 `⬜ 未开始` 的任务
2. 把该任务的"Claude Code 指令"原文复制给 Claude Code
3. Claude Code 完成后，按"验证方法"检查是否正常
4. 没问题就执行 `git commit`，并把本任务 ROADMAP.md 中的状态改为 `✅ 完成`。
5. 出问题就执行 `git checkout .` 回滚，开新对话重试

**原则：每个任务做完才开始下一个，不要跳着做。**

---

## 格式说明（新增任务时照此写）

### 阶段块

```
## 阶段 N：标题（里程碑代号）

> 目标：一句话说明这个阶段完成后系统能做什么。
```

### 任务块

每个任务独占一个三级标题块，格式固定如下：

````
### T{编号} {状态} {任务标题}

**这个任务做什么**：一两句话说明目的，不写实现细节。

**涉及文件**：
- `路径/文件.js` — 改动说明
- `路径/文件.jsx` — 改动说明

**Claude Code 指令**：

```
（给 Claude Code 的完整、可直接执行的指令。
写法要求：
- 先说"请先阅读 @CHANGELOG.md 与 <涉及文件> 的现有内容"
- 再说任务目标
- 列出每个文件的具体改动要求，要精确到函数/字段/行为，不留歧义
- 末尾加"约束"小节，列出不能动的文件和边界条件）
```

**验证方法**：
1. 可操作的步骤，描述预期结果
2. 覆盖正常路径和边界情况
````

### 状态符号

| 符号 | 含义 |
|---|---|
| `⬜ 未开始` | 尚未执行 |
| `🚧 进行中` | 当前正在做 |
| `✅ 完成` | 已验证通过并 commit |
| `❌ 搁置` | 暂时跳过，注明原因 |

### 任务编号规则

- 编号全局唯一，格式 `T{数字}`，从 `CHANGELOG.md` 中最后一个已有编号顺延（不从 ROADMAP 内部编号顺延）
- 新增任务前必须先查 `CHANGELOG.md` 末尾的最大编号，再 +1 起编
- 同一阶段内按实现顺序排列，有依赖关系的任务必须前置

---

## 阶段 2：测试覆盖率补全（Coverage Sprint）

> 目标：按批次补齐后端、前端、assistant 的核心自动化测试，把高风险主链路先覆盖到位，再处理长尾空白。

---

### T170 ⬜ 补后端主链路测试

**这个任务做什么**：优先补后端最关键、收益最高的主流程测试，覆盖聊天、写作、提示词组装和导入导出这四块的异常分支与边界分支，先把主链路稳定性拉起来。

**涉及文件**：
- `backend/tests/routes/chat.test.js` — 补 `/chat` `/stop` `/continue` `/regenerate` 的边界与异常路径测试
- `backend/tests/routes/writing.test.js` — 补写作流式、章节标题、无激活角色、空流/异常流等路径
- `backend/tests/prompts/assembler.test.js` — 补聊天/写作模式下状态栏、记忆展开、日记、suggestion 组合分支
- `backend/tests/routes/import-export.test.js` — 补非法包、缺字段、模式切换、冲突资源、失败回滚

**Claude Code 指令**：

```
请先阅读 CHANGELOG.md 与以下文件的现有内容：
backend/tests/routes/chat.test.js
backend/tests/routes/writing.test.js
backend/tests/prompts/assembler.test.js
backend/tests/routes/import-export.test.js
backend/routes/chat.js
backend/routes/writing.js
backend/prompts/assembler.js
backend/services/import-export.js

目标：补齐后端主链路自动化测试，优先覆盖高风险异常路径和边界条件。

具体要求：
1. 在 backend/tests/routes/chat.test.js 中新增测试，覆盖：
   - /chat 在 LLM 返回空内容、异常中断、客户端提前关闭时的行为
   - /stop 在没有活跃流时的行为
   - /continue 在最后一条 assistant/user 不符合预期时的行为
   - /regenerate 在 afterMessageId 缺失、非法、截断后 turn record 同步处理的行为
2. 在 backend/tests/routes/writing.test.js 中新增测试，覆盖：
   - generate/continue/regenerate 的异常分支
   - 无激活角色、无会话、非法参数的返回
   - 章节标题/会话标题相关 SSE 或落库分支
   - SSE 收尾顺序与 keepSseAlive 相关边界
3. 在 backend/tests/prompts/assembler.test.js 中新增测试，覆盖：
   - buildPrompt 与 buildWritingPrompt 的主要注入矩阵
   - 状态栏、向量召回、记忆展开、日记、suggestion 开关组合
   - 写作模式与聊天模式差异
4. 在 backend/tests/routes/import-export.test.js 中新增测试，覆盖：
   - 非法导入包、缺字段、未知字段、重复资源名
   - replace/merge 等 mode 差异
   - 导入失败时是否中止以及是否污染已有数据

约束：
- 只补测试，不修改运行时代码
- 优先复用现有 helpers/fixtures，不新建重复测试基建
- 不新增快照测试
- 每个测试名要明确写出覆盖的分支或约束
```

**验证方法**：
1. 执行 `npm run test --prefix backend`，确认新增测试全部通过
2. 执行 `npm run test:coverage --prefix backend`，确认 `backend/routes/chat.js`、`backend/routes/writing.js`、`backend/prompts/assembler.js` 的行覆盖率有提升
3. 人工查看覆盖率报告，确认新增测试不是只重复覆盖已有正常路径

---

### T171 ⬜ 批量补后端 service/query 测试

**这个任务做什么**：补齐后端 service 和 db query 层的大量低覆盖长尾文件，优先处理状态系统、消息、prompt entries 和 sessions 相关模块，用模板化方式批量抬升覆盖率。

**涉及文件**：
- `backend/tests/` 下新增或扩展对应测试文件 — 覆盖 `services/` 与 `db/queries/` 的长尾模块
- `backend/tests/helpers/fixtures.js` — 仅在必要时补通用 fixture，减少重复造数据
- `backend/tests/helpers/test-env.js` — 仅在必要时补共用测试环境能力

**Claude Code 指令**：

```
请先阅读 CHANGELOG.md 与以下文件的现有内容：
backend/tests/helpers/fixtures.js
backend/tests/helpers/test-env.js
backend/services/state-values.js
backend/services/chat.js
backend/services/worlds.js
backend/services/sessions.js
backend/memory/state-rollback.js
backend/memory/summary-expander.js
backend/utils/network-safety.js
backend/db/queries/prompt-entries.js
backend/db/queries/messages.js
backend/db/queries/world-state-values.js
backend/db/queries/character-state-values.js
backend/db/queries/persona-state-values.js
backend/db/queries/world-state-fields.js
backend/db/queries/character-state-fields.js
backend/db/queries/persona-state-fields.js

目标：批量补齐后端 service/query 层测试，优先覆盖状态系统、消息和 prompt entries。

具体要求：
1. 为以下 service/memory/utils 模块补测试：
   - state-values.js：默认值、runtime 值、会话级覆盖、异常输入
   - state-rollback.js：有快照回滚、无快照回退 default、缺字段容错
   - summary-expander.js：token budget、缺失 turn record、展开裁剪
   - network-safety.js：本地地址/内网地址/允许地址的判定
   - sessions.js / worlds.js / chat.js：核心编排的失败与边界路径
2. 为以下 query 模块补模板化 CRUD 测试：
   - prompt-entries.js
   - messages.js
   - world/character/persona state fields
   - world/character/persona state values
3. 尽量用统一 helper 生成 world/character/session/message 数据，避免每个文件重复手写 fixture
4. 新增测试文件时命名与现有 backend/tests 目录风格一致

约束：
- 只改 backend/tests/helpers 与 backend/tests 下测试文件
- 不为追覆盖率去改生产代码分支结构
- 相同模式的 query 测试尽量复用 helper，避免复制粘贴大段样板
- 不补第三方 provider 网络集成测试
```

**验证方法**：
1. 执行 `npm run test --prefix backend`，确认无回归
2. 执行 `npm run test:coverage --prefix backend`，确认 `services/state-values.js`、`db/queries/messages.js`、`db/queries/prompt-entries.js` 等长尾文件覆盖率明显提升
3. 随机抽查 3 个新增测试，确认既有正常路径也有失败/空值/不存在资源分支

---

### T172 ⬜ 补前端页面与 API 主链路测试

**这个任务做什么**：补齐前端关键页面、核心 hook 和 API 封装的测试，优先把目前仍是 `0%` 或接近 `0%` 的页面主链路覆盖起来。

**涉及文件**：
- `frontend/tests/pages/*.test.jsx` — 扩展世界、角色、玩家编辑与列表页面测试
- `frontend/tests/api/*.test.js` — 补各 API 封装文件测试
- `frontend/tests/hooks/*.test.jsx` — 补 `useSessionState` 等关键 hook 测试
- `frontend/tests/helpers/react.js` — 仅在必要时补渲染辅助

**Claude Code 指令**：

```
请先阅读 CHANGELOG.md 与以下文件的现有内容：
frontend/tests/pages/chat-page.test.jsx
frontend/tests/pages/writing-space-page.test.jsx
frontend/tests/pages/settings-page.test.jsx
frontend/tests/api/chat.test.js
frontend/tests/api/writing-sessions.test.js
frontend/tests/hooks/use-settings-config.test.jsx
frontend/src/pages/WorldsPage.jsx
frontend/src/pages/WorldEditPage.jsx
frontend/src/pages/CharacterEditPage.jsx
frontend/src/pages/PersonaEditPage.jsx
frontend/src/hooks/useSessionState.js
frontend/src/api/

目标：补齐前端关键页面、hook 和 API 封装测试，优先提升 0% 文件覆盖率。

具体要求：
1. 新增或扩展页面测试，至少覆盖：
   - WorldsPage：加载世界列表、创建/删除入口、空状态或错误状态
   - WorldEditPage：保存世界配置、状态字段区域、异常提示
   - CharacterEditPage：角色保存、头像/字段编辑关键交互
   - PersonaEditPage：玩家信息保存与回显
2. 为 useSessionState 增加测试，覆盖：
   - 初次加载
   - tick/刷新触发重新取数
   - 组件卸载清理
   - 请求失败回退
3. 为目前仍无测试的 api 文件补请求级单测，覆盖：
   - method、path、body 序列化
   - 错误透传
   - 关键 query 参数
4. 保持与现有测试风格一致，继续使用现有 mock fetch / render helper

约束：
- 只改 frontend/tests 下测试文件和必要的测试 helper
- 不修改任何生产组件、页面或 API 实现
- 不使用快照测试
- 页面测试优先覆盖用户实际操作主链路，不写纯实现细节断言
```

**验证方法**：
1. 执行 `npm run test --prefix frontend`，确认前端测试全部通过
2. 执行 `npm run test:coverage --prefix frontend`，确认 `pages/`、`api/`、`hooks/useSessionState.js` 覆盖率提升，且新增的关键页面不再是 `0%`
3. 抽查 2 个页面测试，确认既覆盖正常保存也覆盖失败/空状态

---

### T173 ⬜ 补 assistant 主链路测试

**这个任务做什么**：针对 assistant 当前低覆盖的主路由、main-agent、agent-factory 和工具层补测试，优先保证协议、错误路径和工具调用边界稳定。

**涉及文件**：
- `assistant/tests/routes.test.js` — 补路由参数校验、异常路径、协议边界
- `assistant/tests/routes-integration.test.js` — 补端到端主流程与失败分支
- `assistant/tests/main-agent.test.js` — 补主代理多轮上下文、proposal 分发、错误回退
- `assistant/tests/agent-factory.test.js` — 补 agent 选择与创建失败分支
- 如有必要新增 `assistant/tests/tools/*.test.js` — 覆盖 `card-preview` 与 `extract-json`

**Claude Code 指令**：

```
请先阅读 CHANGELOG.md 与以下文件的现有内容：
assistant/tests/routes.test.js
assistant/tests/routes-integration.test.js
assistant/tests/main-agent.test.js
assistant/tests/agent-factory.test.js
assistant/server/routes.js
assistant/server/main-agent.js
assistant/server/agent-factory.js
assistant/server/tools/card-preview.js
assistant/server/tools/extract-json.js

目标：补齐 assistant 主链路测试，优先覆盖协议边界、错误路径和工具层。

具体要求：
1. 在 routes.test.js / routes-integration.test.js 中补测试，覆盖：
   - 非法请求体、缺 message、缺 proposal、非法 operation
   - execute 路由 token/权限/参数异常
   - chat 路由多轮 history、空返回、工具失败后的响应
2. 在 main-agent.test.js 中补测试，覆盖：
   - proposal 摘要拼接
   - agent 选择与回退
   - 工具调用失败时的降级
   - 多轮上下文下的行为稳定性
3. 在 agent-factory.test.js 中补测试，覆盖：
   - 未知 agent 类型
   - 缺 prompt/template
   - 创建阶段异常
4. 如现有覆盖仍不足，则新增工具测试：
   - card-preview.js
   - extract-json.js

约束：
- 只改 assistant/tests 下测试文件
- 不修改 assistant 运行时代码
- 测试以协议行为为中心，不做实现细节耦合断言
- 不新增网络真实请求
```

**验证方法**：
1. 执行 `npm run test --prefix assistant`，确认所有 assistant 测试通过
2. 执行 `npm run test:coverage --prefix assistant`，确认 `routes.js`、`main-agent.js`、`agent-factory.js` 有明显提升
3. 人工查看覆盖率报告，确认新增测试已覆盖异常/拒绝/降级路径，而不只是正常输入

---

### T174 ⬜ 覆盖率清尾与统一复盘

**这个任务做什么**：在前四批完成后，做一轮统一覆盖率复盘，只补剩余高风险空白分支，并产出一次可执行的测试缺口总结，避免为了数字追无意义覆盖。

**涉及文件**：
- `backend/tests/`、`frontend/tests/`、`assistant/tests/` — 只补剩余高风险缺口
- `ROADMAP.md` — 如有必要，将本阶段剩余问题回写为后续任务

**Claude Code 指令**：

```
请先阅读 CHANGELOG.md、ROADMAP.md 与当前三套 coverage 报告对应的测试文件现有内容。

目标：完成一轮覆盖率清尾与统一复盘，只补高风险缺口，不机械追求满覆盖。

具体要求：
1. 分别执行：
   - npm run test:coverage --prefix backend
   - npm run test:coverage --prefix frontend
   - npm run test:coverage --prefix assistant
2. 识别剩余未覆盖文件中真正高风险的模块，只补以下类型：
   - 核心业务分支
   - 状态系统
   - SSE / 流式收尾
   - 导入导出
   - assistant 协议与工具调用
3. 对低风险薄封装、常量文件、第三方适配细节，不为数字强行补测
4. 如补完后仍有明显空白，更新 ROADMAP.md，在本阶段下追加“剩余风险/后续补测点”说明

约束：
- 不修改生产代码，除非为可测试性必须做极小且无行为变化的重构；若需要改，必须单独说明
- 不删除已有测试
- 不为了覆盖率添加无断言价值的测试
- 最终输出中要明确 backend/frontend/assistant 三套各自的最新覆盖率
```

**验证方法**：
1. 依次执行三套 `test:coverage`，记录 backend/frontend/assistant 最新覆盖率
2. 人工检查剩余低覆盖文件，确认未补部分属于低风险薄封装或暂不值得投入的模块
3. 若 ROADMAP.md 追加了剩余风险说明，确认描述基于实际 coverage 报告而不是主观猜测

**剩余风险/后续补测点（T174 复盘，2026-04-22）**：
- `backend/prompts/assembler.js`、`backend/memory/recall.js` 仍有明显空白；它们属于 prompt 拼装与记忆召回主链路，后续应优先补“异常输入组合/缺上下文/写作模式差异”的流程级测试，而不是继续刷 query 覆盖率
- `frontend/src/pages/ChatPage.jsx`、`frontend/src/pages/WritingSpacePage.jsx` 仍是前端高风险低覆盖区；后续应补“onError 后解锁/流式异常/会话切换竞争态/回调 token 防串线”场景
- `assistant/server/routes.js`、`assistant/server/main-agent.js` 仍有剩余分支未覆盖；后续应补“chat 主流程异常直出 error、不触发 done”“tool_call/routing/proposal 混合顺序”“editedProposal 非法 entry/state ops 拒绝”三类协议测试
