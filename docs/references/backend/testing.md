# Backend Testing

后端相关改动的验证入口与测试分层。

## 默认验证

- 总闸门：`npm run check`
- 定向后端：
  - `npm run test:backend`
  - `npm run lint:backend`

## 测试分层

- `backend/tests/routes/`：HTTP 路由、接口行为、SSE/stream helper
- `backend/tests/services/`：服务层、事务、副作用、导入导出、清理
- `backend/tests/db/`：query 与 schema 约束
- `backend/tests/memory/`：摘要、召回、状态更新、回滚
- `backend/tests/helpers/`：HTTP、fixture、临时环境支撑
- `backend/tests/e2e/`：Playwright 端到端

## 经验规则

- 改业务逻辑、接口行为、状态流、数据库读写、异步任务、prompt 组装顺序：默认应有自动化测试
- 纯文档改动通常不跑后端业务测试；但若改了文档 harness 或脚本，要运行对应脚本
- 无法补自动化测试时，必须在回执中写明原因和最小人工验证方案

## 相关代码文件

- `backend/tests/routes/`
- `backend/tests/services/`
- `backend/tests/db/`
- `backend/tests/helpers/`
- `backend/tests/e2e/`
