# Constants And Shared Modules

跨端单一来源与共享模块速查。

## 单一来源

- `backend/utils/constants.js`：后端硬性数值常量、阈值、默认限制
- `shared/chapter-constants.mjs`：前后端共享分章/翻页阈值。**分章** `CHAPTER_TURN_SIZE` 默认 20 轮（`CHAPTER_MESSAGE_SIZE = CHAPTER_TURN_SIZE * 2` 派生）；**翻页** `PAGE_TURN_SIZE` 默认 50 轮，仅服务 `Pager.jsx`。两者解耦，配置键分别为 `chapter_turn_size` / `page_turn_size`；`resolveChapterMessageSize(chapterTurnSize)` 把"每章轮数"换算成消息条数阈值
- 根 `package.json`：版本号单一来源
- `frontend/src/themes/tokens.css`：核心 token 名与中性默认值

## 主题与样式共享规则

- `frontend/src/themes/*.css` 只消费 token，不定义主题变体
- `themes/<theme>/theme.css` 只覆写 `--we-*` token 取值
- 新增 token 后，要同步检查内置主题、模板主题和自定义 CSS 参考文档

## 导入导出与格式契约

- 角色卡：`.wechar.json`
- 世界卡：`.weworld.json`
- 全局设置：`.weglobal.json`
- 主题包：`.wetheme.json`

格式版本与字段明细以 [`../backend/schema-and-storage.md`](../backend/schema-and-storage.md) 为准。

## 相关代码文件

- `backend/utils/constants.js`
- `shared/chapter-constants.mjs`
- `frontend/src/themes/tokens.css`
- `backend/services/import-export-constants.js`
