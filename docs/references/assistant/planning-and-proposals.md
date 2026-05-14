# Assistant Planning And Proposals

plan 门槛、proposal 归一化、审批门与写入约束。

## Plan 门槛

- 简单问答、单资源小改、1-2 个动作：直接执行，不写 plan
- 至少 3 个真实可执行 step，且命中高风险、跨资源、完整建卡、结构化体系等条件：必须先 `write_plan_doc`
- `awaiting_approval` 不自动推进；用户批准后才进入执行
- `awaiting_approval` 阶段允许继续对话修改方案，但**禁止**直接 `dispatch_subagent` 执行未审批 step
- 计划被拒绝后必须停在 `paused`，不能自动再生成新计划
- 计划被拒绝后，旧 `plan_doc` 不能直接继续执行；必须重新 `write_plan_doc` 或 `edit_plan_doc.replace_steps` 后再次进入审批
- `edit_plan_doc.replace_steps` 不是短路入口；替换后的未完成步骤仍至少要有 3 个，不能借此把复杂任务缩成 1-2 步
- 计划一旦批准并进入执行，只允许 `mark_done` 勾选进度；禁止在执行中再次 `write_plan_doc` 或 `replace_steps` 把前端打回待审批

## Proposal 链路

- 父代理或子代理最终都要产出 proposal
- proposal 在 `assistant/server/normalize-proposal.js` 归一化校验
- 修改 / 删除已有资源前，必须先 `preview_card`
- 资源落库安全边界在后端 normalize + apply 层，不靠 prompt 兜底

## 关键真源

- plan doc 工具：`assistant/server/tools/meta/`
- proposal 归一化：`assistant/server/normalize-proposal.js`
- plan doc 解析：`assistant/server/plan-doc.js`
- 回归测试：`assistant/tests/plan-doc.test.mjs`、`assistant/tests/routes-http.test.js`

## 相关代码文件

- `assistant/server/normalize-proposal.js`
- `assistant/server/tools/meta/runtime.js`
- `assistant/server/plan-doc.js`
- `assistant/tests/plan-doc.test.mjs`
