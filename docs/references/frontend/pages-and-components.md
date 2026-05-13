# Frontend Pages And Components

页面、domain 组件、UI 组件和 shell 组件的归属规则。

## 先判断落点

1. 只服务某个 shell：放 `shells/<shell>/`
2. 是页面布局契约：放 `pages/layout/`
3. 领域无关视觉组件：放 `components/ui/`
4. 跨页面复用的业务组件：放 `components/<domain>/`
5. 仅某页面使用：放 `pages/<Page>/components/`

## 当前约束

- `components/ui/` 只收视觉原子与分子，并同步到 `components/index.js`
- domain 组件直接路径 import，不进 barrel
- page-local 组件禁止跨页面引用
- 编辑页优先复用 `pages/layout/EditPageShell.jsx`
- 通用表单块优先复用 `FormGroup`
- 确认弹窗优先复用 `ConfirmModal`

## 相关代码文件

- `frontend/src/components/ui/`
- `frontend/src/components/settings/`
- `frontend/src/pages/CharacterEditPage/components/`
- `frontend/src/pages/layout/EditPageShell.jsx`
