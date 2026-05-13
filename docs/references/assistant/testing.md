# Assistant Testing

assistant 改动时优先跑的验证入口与回归重点。

## 默认验证

- `npm run test:assistant`
- assistant 牵动跨端边界时，再补 `npm run check`

## 测试落点

- `assistant/tests/plan-doc.test.mjs`：plan doc 渲染、解析、步骤选择
- `assistant/tests/routes-http.test.js`：HTTP / SSE / recover / approve / reject
- `assistant/tests/parent-agent.test.mjs`：父代理编排、plan-first、恢复文案
- `assistant/tests/sub-agent.test.js`：子代理工具链与预览闸门
- `assistant/tests/task-store*.test.js`：任务态、hydrate、恢复

## 回归重点

- 计划审批门
- proposal 写入约束
- 子代理失败暂停
- 恢复链路与 `resume:true`
- 前端错误态、计划 HUD 与重新生成入口

## 相关代码文件

- `assistant/tests/routes-http.test.js`
- `assistant/tests/parent-agent.test.mjs`
- `assistant/tests/sub-agent.test.js`
- `assistant/tests/task-store.test.js`
