# Phase 4：Story 双预设设计文档

**日期**：2026-04-23  
**阶段**：v2 Phase 4 — Story 双预设（角色扮演 / 叙事创作）统一会话入口  
**状态**：待实现

---

## 一、目标

将现有两套独立会话系统（`ChatPage` 角色扮演 + `WritingSpacePage` 叙事创作）统一为以世界为中心的"故事会话"体系。用户通过 TopBar 切换 appMode，世界下有统一的"故事"入口（`/worlds/:worldId/story`），`sessions.preset` 字段驱动 prompt 和渲染差异。

---

## 二、现状

| 项目 | 当前状态 |
|---|---|
| 会话类型 | `sessions.mode = 'chat'`（角色中心）或 `'writing'`（世界中心） |
| 路由 | `/characters/:characterId/chat` 和 `/worlds/:worldId/writing` |
| TopBar | 分别有"对话"和"写作"两个独立导航入口 |
| 角色激活 | 写作会话内部通过 `writing_session_characters` 管理，每次进入需重新选 |

---

## 三、路由变更

| 旧路由 | 状态 | 新路由 |
|---|---|---|
| `/characters/:characterId/chat` | 保留（兼容层） | 废弃导航，ChatPage 继续服务旧 URL |
| `/worlds/:worldId/writing` | 保留（兼容层） | 废弃导航，WritingSpacePage 继续服务旧 URL |
| `/worlds/:worldId` | 保留 | CharactersPage，仅作角色管理 |
| `/worlds/:worldId/story`（新增） | — | StoryWorldPage，双模式会话入口 |
| `/worlds/:worldId/story/sessions/:sessionId`（新增） | — | StorySessionPage，会话主体 |

世界详情下的 TopBar 标签：**角色 · 故事 · 状态**（与 PROJECT.md §1.2 对齐）。

---

## 四、数据模型变更

### 4.1 `sessions` 表新增字段

```sql
ALTER TABLE sessions ADD COLUMN preset TEXT NOT NULL DEFAULT 'roleplay';
-- 取值：'roleplay' | 'narrative'
```

启动时一次性迁移（`internal_meta` key: `migration:phase4_preset`）：

```sql
UPDATE sessions SET preset = 'narrative' WHERE mode = 'writing';
```

`mode` 字段保留，继续区分会话架构：

| mode | preset | 含义 |
|---|---|---|
| `chat` | `roleplay` | 角色扮演会话（原 chat 会话） |
| `writing` | `narrative` | 叙事创作会话（原 writing 会话） |

v2 不支持 `chat+narrative` 或 `writing+roleplay` 交叉组合。

### 4.2 新增表 `world_writing_defaults`

```sql
CREATE TABLE IF NOT EXISTS world_writing_defaults (
  id           TEXT PRIMARY KEY,
  world_id     TEXT NOT NULL UNIQUE REFERENCES worlds(id) ON DELETE CASCADE,
  active_character_ids TEXT NOT NULL DEFAULT '[]', -- JSON 字符串数组
  updated_at   INTEGER NOT NULL
);
```

**用途**：写作模式世界页的默认激活角色列表。  
**关系**：新建 `preset='narrative'` 会话时，从此表初始化 `writing_session_characters`；进入已有会话时不覆盖会话内的激活状态。  
**删除策略**：`ON DELETE CASCADE` 随世界自动清理，无需注册额外钩子。

---

## 五、后端变更

### 5.1 `db/schema.js`

- 新增 `ALTER TABLE sessions ADD COLUMN preset`（`try/catch` 防已存在）
- 新增 `CREATE TABLE IF NOT EXISTS world_writing_defaults`
- 新增一次性迁移（`internal_meta` 幂等保护）

### 5.2 新增路由文件

**`backend/routes/story-sessions.js`**（挂载在 `/api/worlds`）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/worlds/:worldId/story-sessions` | 列出故事会话（query: `?preset=roleplay\|narrative`） |
| POST | `/api/worlds/:worldId/story-sessions` | 创建会话（body: `preset`, `characterId?`） |
| GET | `/api/worlds/:worldId/story-sessions/latest` | 最近一个指定 preset 的会话（query: `?preset=`, `?characterId=`） |
| DELETE | `/api/worlds/:worldId/story-sessions/:sessionId` | 删除 |

**`backend/routes/world-writing-defaults.js`**

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/worlds/:worldId/writing-defaults` | 获取默认激活角色列表 |
| PUT | `/api/worlds/:worldId/writing-defaults` | 更新（body: `active_character_ids: string[]`） |

### 5.3 `backend/services/story-sessions.js`（新建）

核心函数：

- `createStorySession(worldId, preset, characterId?)` — 创建会话；`preset='narrative'` 时从 `world_writing_defaults` 初始化 `writing_session_characters`
- `getLatestOrCreateSession(worldId, preset, characterId?)` — 取最近会话，不存在时自动创建
- `listStorySessions(worldId, preset?)` — 列出，可按 preset 筛选

### 5.4 `backend/db/queries/story-sessions.js`（新建）

所有 SQL 操作，包含：`insertStorySession`、`getLatestStorySession`、`listStorySessions`、`deleteStorySession`、`getWritingDefaults`、`upsertWritingDefaults`。

### 5.5 `backend/prompts/assembler.js` 新增分发层

```js
// buildStoryPrompt: 按 preset 分发，不改内部组装顺序
async function buildStoryPrompt(sessionId, options) {
  const session = getSession(sessionId);
  if (session.preset === 'narrative') return buildWritingPrompt(sessionId, options);
  return buildPrompt(sessionId, options);
}
```

`buildPrompt()` 和 `buildWritingPrompt()` 保留不改（assembler.js 为锁定文件，不改组装顺序）。

### 5.6 现有路由保留

`routes/chat.js` 和 `routes/writing.js` 的全部端点**不删除**，新 story 会话复用这两套端点（前端按 preset 拼正确路径）。不新增 `/story/generate` 端点。

---

## 六、前端变更

### 6.1 `store/appMode.js`（改动）

- 初始化时从 `localStorage('we-app-mode')` 读取，默认 `'chat'`
- 新增 `initAppMode()` action，在 `App.jsx` `useEffect` 里调用

### 6.2 `components/book/TopBar.jsx`（改动）

- 移除"对话"和"写作"两个独立导航入口
- 新增内联 `AppModeToggle` 按钮（两态：角色扮演 ⇌ 叙事创作）
  - 点击：`setAppMode()` + 写 `localStorage`
  - 当前路径含 `/worlds/:worldId`：切换后导航到 `/worlds/:worldId/story`
- 世界详情下标签：**角色 · 故事 · 状态**（故事标签指向 `/worlds/:worldId/story`）

### 6.3 `pages/StoryWorldPage.jsx`（新建）

路由：`/worlds/:worldId/story`

**角色扮演模式（appMode='chat'）**：
- 布局与 CharactersPage 角色卡列表相同（复用 `we-character-card-*` CSS 类）
- 点击角色卡 → `getLatestOrCreateSession(worldId, characterId, 'roleplay')` → 导航到 `/worlds/:worldId/story/sessions/:sessionId`
- 玩家卡：不可进入会话，显示提示文案

**叙事创作模式（appMode='writing'）**：
- 角色卡新增激活态视觉（选中边框，复用书卷风设计变量）
- 点击角色卡 → `updateWritingDefaults()` 切换激活状态，不导航
- 顶部显示已激活角色数量徽章
- 玩家卡：点击 → `getLatestOrCreateSession(worldId, null, 'narrative')` → 导航到会话页

### 6.4 `pages/StorySessionPage.jsx`（新建）

路由：`/worlds/:worldId/story/sessions/:sessionId`

按 `session.preset` 分支渲染：

| preset | UI 组件 | 后端端点 |
|---|---|---|
| `roleplay` | `MessageList` + `InputBox`（复用 chat 组件） | `/api/sessions/:id/chat` 等 |
| `narrative` | `WritingMessageItem` + `InputBox`（复用 writing 组件） | `/api/worlds/:id/writing-sessions/:id/generate` 等 |

共用部分（不因 preset 变化）：
- 左侧：会话列表侧边栏，新增 preset 徽章（`角色扮演` / `叙事`）
- 右侧：`StatePanel`（状态面板）
- 顶部：面包屑返回 StoryWorldPage

### 6.5 `App.jsx`（改动）

新增路由：
```jsx
<Route path="/worlds/:worldId/story" element={<StoryWorldPage />} />
<Route path="/worlds/:worldId/story/sessions/:sessionId" element={<StorySessionPage />} />
```

旧路由保留（兼容外链）：
```jsx
<Route path="/characters/:characterId/chat" element={<ChatPage />} />
<Route path="/worlds/:worldId/writing" element={<WritingSpacePage />} />
```

### 6.6 `api/story-sessions.js`（新建）

封装全部 story-sessions 和 writing-defaults fetch 调用：
- `listStorySessions(worldId, preset?)`
- `getLatestOrCreateSession(worldId, characterId, preset)`
- `createStorySession(worldId, preset, characterId?)`
- `deleteStorySession(worldId, sessionId)`
- `getWritingDefaults(worldId)`
- `updateWritingDefaults(worldId, activeCharacterIds)`

---

## 七、不在 Phase 4 范围内

| 功能 | 说明 |
|---|---|
| 删除 `ChatPage.jsx` / `WritingSpacePage.jsx` | 作为旧 URL 兼容层保留 |
| 修改 `assembler.js` 内部组装顺序 | 锁定文件，`buildStoryPrompt` 只做分发 |
| Forge 实体注入 | Phase 2 范围 |
| 多角色 Roleplay Prompt 逻辑 | Phase 4 不改写作 prompt 内部逻辑 |
| 删除旧 HTTP 端点 | `chat.js` / `writing.js` 端点保留 |

---

## 八、测试策略

### 自动化测试

| 文件 | 覆盖内容 |
|---|---|
| `backend/tests/db/queries/story-sessions.test.js` | `preset` 字段读写、迁移正确性、`world_writing_defaults` CRUD |
| `backend/tests/services/story-sessions.test.js` | `createStorySession` 初始化 `writing_session_characters`、`getLatestOrCreateSession` 自动创建 |
| `frontend/tests/api/story-sessions.test.js` | HTTP 封装、错误路径 |

### 人工验证清单

1. 切换 appMode → TopBar 状态更新，刷新后模式持久
2. 角色扮演模式：点击角色 → 进入上次 roleplay 会话（无则自动创建）
3. 叙事创作模式：点击角色 → 激活状态切换，点玩家 → 进入上次 narrative 会话
4. 新建 narrative 会话：`writing_session_characters` 从 `world_writing_defaults` 初始化
5. 旧 URL `/characters/:id/chat` 仍可访问
6. `preset='roleplay'` 会话：气泡 UI；`preset='narrative'` 会话：散文 UI
7. 状态更新：roleplay 更新角色+玩家；narrative 更新三层全量

---

## 九、文档同步触发器

| 文件 | 改动原因 |
|---|---|
| `SCHEMA.md` | 新增 `sessions.preset` 字段、`world_writing_defaults` 表 |
| `ARCHITECTURE.md` | 新增路由映射、`buildStoryPrompt` 分发层说明 |
| `CHANGELOG.md` | 完成后追加一条记录 |
