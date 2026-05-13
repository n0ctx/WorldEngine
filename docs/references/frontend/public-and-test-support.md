# Frontend Public And Test Support

前端公共静态资源与测试支撑入口。

## 什么时候读

- 改 `frontend/public/` 图标、logo、静态资源
- 改 `frontend/tests/setup*`、测试 helper、axe 配置
- 想知道前端 API / 页面 / hooks 测试支撑放哪里

## 当前分工

- `frontend/public/`：favicon、logo、静态 SVG 等直接随前端构建输出
- `frontend/tests/setup.js`：Vitest 全局测试入口
- `frontend/tests/setup/axe-setup.js`：无障碍断言配置
- `frontend/tests/helpers/`：测试渲染与辅助函数
- `frontend/tests/api/`：前端 API 封装测试
- `frontend/tests/hooks/`：hooks 测试

## 相关代码文件

- `frontend/public/logo.png`
- `frontend/public/icons.svg`
- `frontend/tests/setup.js`
- `frontend/tests/setup/axe-setup.js`
- `frontend/tests/helpers/react.js`
