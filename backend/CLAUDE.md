# WorldEngine 后端 — Agent 规则

- 接口处理在 `routes/`，流程编排在 `app/`，业务校验与连带操作在 `services/`，数据库查询及 SQL 在 `db/queries/`。接口层的写操作经业务层，不直接调用查询层写函数；现有依赖边界由根目录 `npm run check:architecture` 检查。
- 修改接口或持久化行为时，沿现有路由、业务层、查询层及对应测试核对输入、错误处理和数据副作用；不要仅以 HTTP 返回值证明持久化后的状态正确。
- 后端测试使用根目录 `npm run test:backend`，lint 使用 `npm run lint:backend`；可先运行对应测试文件，再按改动范围运行整套检查。端到端测试单独使用 `npm run test:e2e`。
