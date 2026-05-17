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

## dispatch_subagent.stateValues 工具层解析（typed 入参）

针对 `targetType=persona-card / character-card` 的状态值写入，`dispatch_subagent` 接受结构化入参 `stateValues: [{ field?, field_key?, value, target? }]`：

- 入口：`assistant/server/tools/meta/state-values-resolver.js`（被 `runtime.js` 内的 `dispatchSubagent.execute` 调用）
- 工具层从 `world_state_fields`/`persona_state_fields`/`character_state_fields` 读 schema，按字段 `type` 校验并强转 `value` → `value_json`（list 给数组、number 给数字、enum 给枚举字符串、boolean 给 `true/false`、datetime 给 `"YYYY-MM-DDTHH:mm"`、table 给 `{col:number}`、清空给 `null`）
- 解析失败 → `{success:false, error}` 直接返回给父代理，**不进 sub-agent**，杜绝"猜格式"导致的 proposal 校验失败
- 解析成功 → 把已校验的 `stateValueOps` JSON 块拼到子代理 `task` 末尾，子代理（见 `prompts/sub-agent.md`）必须原样作为 `apply_*.stateValueOps` 提交，不再读 cheatsheet 推断
- 仅支持 `persona-card / character-card`；写世界字段定义（`stateFieldOps`）仍走 `world-card.update` + cheatsheet
- 回归：`assistant/tests/state-values-resolver.test.mjs`

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
