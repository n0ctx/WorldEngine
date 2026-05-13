# Frontend Testing

前端相关改动的验证入口与经验规则。

## 默认验证

- 总闸门：`npm run check`
- 定向前端：
  - `npm run test:frontend`
  - `cd frontend && npm run build`
  - `cd frontend && npm run lint`

## 测试落点

- `frontend/tests/pages/`：页面级交互与回归
- `frontend/tests/components/`：组件级行为
- `frontend/tests/store/`：状态与 store
- `frontend/tests/api/`：前端 API 封装测试
- `frontend/tests/hooks/`：hooks 测试
- `frontend/src/**/__tests__/`：靠近源码的 UI / utils 测试

## 判断规则

- 纯文档改动：通常不跑前端业务测试，但若改了文档 harness 要跑 `npm run check:docs`
- 纯样式/结构改动：至少确认是否需要 `frontend` lint 或 build
- 涉及前端状态、路由、交互逻辑：优先补或运行 `test:frontend`

## 相关代码文件

- `frontend/tests/pages/`
- `frontend/tests/components/`
- `frontend/tests/api/`
- `frontend/tests/hooks/`
- `frontend/tests/store/`
- `frontend/src/components/ui/__tests__/`
