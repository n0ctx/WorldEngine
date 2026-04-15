# WorldEngine — 开发路线图

## 使用方法

1. 按顺序找到第一个状态为 `⬜ 未开始` 的任务
2. 把该任务的"Claude Code 指令"原文复制给 Claude Code
3. Claude Code 完成后，按"验证方法"检查是否正常
4. 没问题就执行 `git commit`，CHANGELOG.md 追加一条记录，把本任务 ROADMAP.md 中的状态改为 `✅ 完成`，继续下一个任务
5. 出问题就执行 `git checkout .` 回滚，开新对话重试

**原则：每个任务做完才开始下一个，不要跳着做。**

---

## 格式说明（新增任务时照此写）

### 阶段块

```
## 阶段 N：标题（里程碑代号）

> 目标：一句话说明这个阶段完成后系统能做什么。
```

### 任务块

每个任务独占一个三级标题块，格式固定如下：

````
### T{编号} {状态} {任务标题}

**这个任务做什么**：一两句话说明目的，不写实现细节。

**涉及文件**：
- `路径/文件.js` — 改动说明
- `路径/文件.jsx` — 改动说明

**Claude Code 指令**：

```
（给 Claude Code 的完整、可直接执行的指令。
写法要求：
- 先说"请先阅读 @CHANGELOG.md 与 <涉及文件> 的现有内容"
- 再说任务目标
- 列出每个文件的具体改动要求，要精确到函数/字段/行为，不留歧义
- 末尾加"约束"小节，列出不能动的文件和边界条件）
```

**验证方法**：
1. 可操作的步骤，描述预期结果
2. 覆盖正常路径和边界情况
````

### 状态符号

| 符号 | 含义 |
|---|---|
| `⬜ 未开始` | 尚未执行 |
| `🚧 进行中` | 当前正在做 |
| `✅ 完成` | 已验证通过并 commit |
| `❌ 搁置` | 暂时跳过，注明原因 |

### 任务编号规则

- 编号全局唯一，格式 `T{数字}`，从上一个已有编号顺延
- 同一阶段内按实现顺序排列，有依赖关系的任务必须前置

---

## 阶段 5：体验打磨（M5）

> 目标：基于试用反馈，修复交互细节，提升编辑体验与信息感知。

---

### T35 ✅ Prompt 编辑框 WYSIWYG + 体验优化

**这个任务做什么**：将全局/世界/玩家/角色的所有提示词编辑框升级为支持边输入边渲染 Markdown 的所见即所得编辑器（Obsidian 风格），同时修复编辑框不可纵向拉伸和滚动条与圆角冲突的问题。

**涉及文件**：
- `frontend/package.json` — 新增 `@uiw/react-md-editor` 依赖
- `frontend/src/components/ui/MarkdownEditor.jsx` — 新建，封装 MDEditor，对外 API 与 Textarea 保持一致
- `frontend/src/components/ui/Textarea.jsx` — 移除 `resize-none`，改为 `resize-y`；容器修复滚动条与圆角冲突
- `frontend/src/pages/SettingsPage.jsx` — 全局 system_prompt / post_prompt 改用 MarkdownEditor
- `frontend/src/pages/WorldsPage.jsx` — 世界 system_prompt / post_prompt 改用 MarkdownEditor
- `frontend/src/pages/CharacterEditPage.jsx` — 角色 system_prompt / post_prompt / first_message 改用 MarkdownEditor
- `frontend/src/pages/CharactersPage.jsx` — PersonaEditModal 中 system_prompt 改用 MarkdownEditor
- `frontend/src/components/prompt/EntryEditor.jsx` — 条目 content / summary 改用 MarkdownEditor

**Claude Code 指令**：

```
请先阅读 @CHANGELOG.md 与以下文件的现有内容：
- frontend/src/components/ui/Textarea.jsx
- frontend/src/components/ui/MarkdownEditor.jsx（若不存在则新建）
- frontend/src/pages/SettingsPage.jsx
- frontend/src/pages/WorldsPage.jsx
- frontend/src/pages/CharacterEditPage.jsx
- frontend/src/pages/CharactersPage.jsx
- frontend/src/components/prompt/EntryEditor.jsx

任务：将所有提示词编辑框升级为 WYSIWYG Markdown 编辑器，修复 resize 和滚动条问题。

步骤一：安装依赖
在 frontend/ 目录下执行：npm install @uiw/react-md-editor

步骤二：新建 frontend/src/components/ui/MarkdownEditor.jsx
- 对 @uiw/react-md-editor 的 MDEditor 做薄封装
- Props：value, onChange, placeholder, minHeight（可选，默认 120px），className
- 使用 preview="live" 模式（边输入边渲染）
- 隐藏 toolbar（或仅保留 bold/italic/heading/quote/code 五个按钮）
- 用 CSS 变量覆盖 MDEditor 默认样式，使其匹配项目风格：
  - 背景色：var(--we-bg-ivory) 或 var(--we-surface)
  - 边框：1px solid var(--we-border)，focus 时 var(--we-accent)
  - 字体：var(--we-font-sans)，字号 0.875rem（text-sm）
  - 圆角：var(--we-radius) 或 rounded-lg
- 组件默认导出

步骤三：修改 frontend/src/components/ui/Textarea.jsx
- 将 className 中的 `resize-none` 改为 `resize-y`
- 给 textarea 外层容器（若有）加 `overflow-hidden rounded-lg` 以解决原生滚动条撑破圆角的问题；若 textarea 本身就是顶层元素，可将 `rounded-lg` 移到 textarea 上并加 `overflow-auto`

步骤四：替换各页面的 system_prompt / post_prompt / first_message / content / summary 编辑框
替换规则：将原来的 `<Textarea ... rows={N}>` 改为 `<MarkdownEditor ... minHeight={N*24}px />`
- SettingsPage.jsx：global system_prompt、global post_prompt
- WorldsPage.jsx：world system_prompt、world post_prompt
- CharacterEditPage.jsx：character system_prompt、character post_prompt、character first_message
- CharactersPage.jsx：PersonaEditModal 中的 system_prompt
- EntryEditor.jsx：条目 content、条目 summary

不替换的编辑框（保持纯 textarea）：
- StateFieldEditor.jsx 中的 description 和 update_instruction（短文本描述，无需 Markdown）
- 所有 Input 组件（单行文本）

约束：
- 不改任何锁定文件
- MarkdownEditor 样式必须走 CSS 变量，不硬编码色值
- MDEditor 自带的全屏/预览切换/拖拽分割线等功能如与项目风格冲突可通过 CSS 隐藏
- @uiw/react-md-editor 可能自带默认深色主题，需确保强制使用浅色（data-color-mode="light" 属性或等效方式）
```

**验证方法**：
1. 打开任意 system_prompt 编辑框，输入 `**粗体**`，预览区域实时显示为粗体；输入 `# 标题` 显示为大字标题
2. 拖拽编辑框底部边缘，可纵向拉伸
3. 编辑框内容超出高度时出现滚动条，滚动条不撑破圆角容器
4. 编辑框颜色/字体与页面其他 Input 风格一致，无明显违和
5. EntryEditor 的 content 和 summary 框同样支持 Markdown 预览
6. StateFieldEditor 的 description / update_instruction 仍为纯 textarea，不受影响

---

### T36 ⬜ 状态字段表单逻辑修正

**这个任务做什么**：修复状态字段编辑表单中 update_mode 与 trigger_mode 的不合理联动（manual 时仍显示触发时机），改善两个说明字段的 placeholder，移除不应暴露给用户的 allow_empty 控件，并将新建字段的默认值改为更合理的 llm_auto / every_turn。

**涉及文件**：
- `frontend/src/components/state/StateFieldEditor.jsx` — 主要改动
- `backend/db/queries/world-state-fields.js` — 默认值修改
- `backend/db/queries/character-state-fields.js` — 默认值修改
- `backend/db/queries/persona-state-fields.js` — 默认值修改

**Claude Code 指令**：

```
请先阅读 @CHANGELOG.md 与以下文件的现有内容：
- frontend/src/components/state/StateFieldEditor.jsx
- backend/db/queries/world-state-fields.js
- backend/db/queries/character-state-fields.js
- backend/db/queries/persona-state-fields.js

任务：修正状态字段表单的逻辑和默认值。

前端改动（StateFieldEditor.jsx）：

1. 找到初始 state 的定义处，将以下两个默认值修改：
   - update_mode: 'manual' → 'llm_auto'
   - trigger_mode: 'manual_only' → 'every_turn'

2. 在 trigger_mode 选择器的渲染位置，增加条件判断：
   当 form.update_mode === 'manual' 时，将 trigger_mode 整块（包含 label、select 控件、关键词 tag 输入区域）完全隐藏（不渲染，不占位）

3. 找到 description 字段的 textarea/input，将其 placeholder 改为：
   「字段含义说明」——告诉 LLM 这个字段代表什么，会注入到提示词上下文中

4. 找到 update_instruction 字段的 textarea/input，将其 placeholder 改为：
   「更新指令」——告诉 LLM 在何种情况下、如何判断并更新这个字段的值

5. 找到 allow_empty checkbox 整块 JSX（约在第 331-336 行），将其完整删除；
   在 handleSave 提交 payload 的地方，硬编码加上 allow_empty: 1（后端字段保留，前端不再让用户设置）

后端改动（三个 queries 文件，各改 createXxx 函数）：

6. world-state-fields.js 的 createWorldStateField 函数：
   - update_mode ?? 'manual' → update_mode ?? 'llm_auto'
   - trigger_mode ?? 'manual_only' → trigger_mode ?? 'every_turn'

7. character-state-fields.js 的 createCharacterStateField 函数：同上

8. persona-state-fields.js 的 createPersonaStateField 函数：同上

约束：
- 不改任何锁定文件
- 后端数据库 schema 不变，allow_empty 列保留（DEFAULT 1），只是前端不再暴露
- update_mode=manual 时 trigger_mode 仅前端隐藏，后端保存时若传入也应保留（不强制覆盖）
```

**验证方法**：
1. 新建一个状态字段，确认默认选中「LLM 自动」和「每轮更新」
2. 将更新方式切换为「手动」，触发时机选择器和关键词输入区域消失
3. 将更新方式切换回「LLM 自动」，触发时机重新出现
4. description 和 update_instruction 框的 placeholder 显示为更新后的说明文案
5. 表单底部不再出现「允许值为空」checkbox
6. 保存字段后，allow_empty 仍为 1（可通过后端日志或数据库查看）

---

### T37 ⬜ 对话消息 CSS+HTML 渲染支持

**这个任务做什么**：为 assistant 消息的 Markdown 渲染添加 HTML 标签支持（如 `<br>`, `<details>`, `<b>` 等），同时引入 sanitize 防止 XSS 注入。

**涉及文件**：
- `frontend/package.json` — 新增 `rehype-raw`、`rehype-sanitize`
- `frontend/src/components/chat/MessageItem.jsx` — 添加 rehype 插件

**Claude Code 指令**：

```
请先阅读 @CHANGELOG.md 与 frontend/src/components/chat/MessageItem.jsx 的现有内容。

任务：为对话消息渲染添加 HTML 支持。

步骤一：在 frontend/ 目录下安装依赖
npm install rehype-raw rehype-sanitize

步骤二：修改 MessageItem.jsx
1. 在文件顶部现有 import 后，新增：
   import rehypeRaw from 'rehype-raw';
   import rehypeSanitize from 'rehype-sanitize';

2. 在组件顶部（渲染函数外部）定义常量：
   const REHYPE_PLUGINS = [rehypeRaw, rehypeSanitize];

3. 找到渲染 assistant 消息内容的 <ReactMarkdown> 元素，加上 prop：
   rehypePlugins={REHYPE_PLUGINS}

注意：
- 流式生成中（streaming 时）消息内容用 whitespace-pre-wrap 纯文本展示，不走 ReactMarkdown，无需改动
- 只给 assistant 消息的 ReactMarkdown 加插件，user 消息若有单独渲染逻辑不受影响

约束：
- 只改 MessageItem.jsx 这一个逻辑文件（package.json 的依赖变更除外）
- 不改任何锁定文件
```

**验证方法**：
1. 让 AI 回复包含 `<br>` 换行，消息中出现实际换行而非显示原始标签文本
2. 让 AI 回复包含 `<b>粗体</b>`，显示为粗体
3. 让 AI 回复包含 `<details><summary>展开</summary>内容</details>`，页面显示可折叠的 details 元素
4. 尝试包含 `<script>alert(1)</script>` 的消息，不执行脚本（sanitize 生效）
5. 普通 Markdown（**粗体**、## 标题、代码块等）渲染不受影响

---

### T38 ⬜ 玩家卡导出为角色卡

**这个任务做什么**：在玩家（Persona）编辑弹窗新增「导出为角色卡」按钮，将玩家的基础信息导出为标准 `.wechar.json` 角色卡格式，方便跨世界复用。

**涉及文件**：
- `backend/services/import-export.js` — 新增 `exportPersona(worldId)` 函数
- `backend/routes/import-export.js` — 新增 `GET /api/worlds/:worldId/persona/export` 路由
- `frontend/src/api/importExport.js` — 新增 `exportPersona` 和 `downloadPersonaCard`
- `frontend/src/pages/CharactersPage.jsx` — PersonaEditModal 新增导出按钮

**Claude Code 指令**：

```
请先阅读 @CHANGELOG.md 与以下文件的现有内容：
- backend/services/import-export.js
- backend/routes/import-export.js
- frontend/src/api/importExport.js
- frontend/src/pages/CharactersPage.jsx

任务：新增玩家卡导出功能。

后端（import-export.js service）：
1. 在 exportCharacter 函数之后，新增 exportPersona(worldId) 函数：
   - 查询 personas 表，取 name / system_prompt / avatar_path（WHERE world_id = worldId）
   - 若 persona 不存在则 throw new Error('玩家不存在')
   - 读取头像 base64（逻辑与 exportCharacter 中的头像读取完全一致，复用即可）
   - 返回与 worldengine-character-v1 格式相同的对象：
     {
       format: 'worldengine-character-v1',
       character: {
         name, system_prompt, first_message: '', post_prompt: '',
         avatar_base64, avatar_mime
       },
       prompt_entries: [],
       character_state_values: []
     }
   - 导出该函数

后端（import-export routes）：
2. 新增路由：GET /api/worlds/:worldId/persona/export
   - 调用 exportPersona(worldId)，返回 JSON
   - 错误处理与现有 exportCharacter 路由保持一致

前端（importExport.js）：
3. 新增两个函数：
   - exportPersona(worldId)：GET /api/worlds/${worldId}/persona/export，返回 JSON 数据
   - downloadPersonaCard(worldId, filename)：调用 exportPersona，创建 Blob 下载，逻辑与 downloadCharacterCard 完全一致

前端（CharactersPage.jsx）：
4. 在 PersonaEditModal 的底部操作区（或头像下方），新增「导出为角色卡」按钮
   - 点击调用 downloadPersonaCard(currentWorldId, `${persona.name}.wechar.json`)
   - 按钮样式与页面内其他次要按钮一致

约束：
- 不改任何锁定文件
- 不新建路由文件，只在现有 import-export.js 路由和 service 文件中追加
- personas 表没有 post_prompt 和 first_message 列，导出时填空字符串即可
```

**验证方法**：
1. 打开任意世界的玩家编辑弹窗，底部出现「导出为角色卡」按钮
2. 点击按钮，浏览器下载一个 `{玩家名}.wechar.json` 文件
3. 打开文件，format 为 `worldengine-character-v1`，name/system_prompt 与玩家设置一致，first_message 和 post_prompt 为空字符串
4. 将导出的 .wechar.json 文件通过「导入角色卡」导入到同一世界，角色被正确创建

---

### T39 ✅ 状态字段编辑入口重构

**这个任务做什么**：将角色状态字段和玩家状态字段的「定义管理」（模板设计）统一迁移到世界编辑弹窗中；原角色编辑页和玩家编辑弹窗改为直接编辑该实体当前的状态值，不再管理字段定义。

**前置条件**：T36 已完成。

**涉及文件**：
- `frontend/src/pages/WorldsPage.jsx` — 世界编辑弹窗新增「角色状态字段」和「玩家状态字段」两个 section
- `frontend/src/pages/CharacterEditPage.jsx` — 移除 StateFieldList，改为状态值直接编辑面板
- `frontend/src/pages/CharactersPage.jsx` — PersonaEditModal 移除 StateFieldList，改为状态值直接编辑面板
- `backend/routes/character-state-values.js` — 新增 PATCH 写入接口
- `backend/routes/persona-state-values.js`（或现有 persona 路由文件）— 新增 PATCH 写入接口
- `frontend/src/api/characterStateValues.js` — 新增 updateCharacterStateValue
- `frontend/src/api/personaStateValues.js` — 新增 updatePersonaStateValue

**Claude Code 指令**：

```
请先阅读 @CHANGELOG.md 与以下文件的现有内容：
- frontend/src/pages/WorldsPage.jsx
- frontend/src/pages/CharacterEditPage.jsx
- frontend/src/pages/CharactersPage.jsx
- frontend/src/components/state/StateFieldList.jsx
- backend/routes/character-state-values.js
- backend/routes/persona-state-values.js（若不存在则查找 persona 相关路由文件）
- backend/db/queries/character-state-values.js
- backend/db/queries/persona-state-values.js
- frontend/src/api/characterStateValues.js
- frontend/src/api/personaStateValues.js

任务：重构状态字段编辑入口，字段定义集中到世界弹窗，角色/玩家页改为编辑当前值。

一、WorldsPage.jsx — 世界编辑弹窗新增两组字段定义管理

在现有「世界状态字段」StateFieldList 下方，追加两个 StateFieldList：
- 标题「角色状态字段」：scope="character"，使用 listCharacterStateFields(worldId) / createCharacterStateField / updateCharacterStateField / deleteCharacterStateField / reorderCharacterStateFields，这些 API 端点已存在（GET/POST/PUT/DELETE /api/worlds/:worldId/character-state-fields）
- 标题「玩家状态字段」：scope="persona"，使用 listPersonaStateFields(worldId) / createPersonaStateField 等，端点同样已存在
- 世界编辑弹窗内容可能变长，确保弹窗容器有 overflow-y-auto 且有合理的 max-height

二、后端新增状态值 PATCH 接口

character-state-values.js 路由（在现有 GET 路由后追加）：
- PATCH /api/characters/:characterId/state-values/:fieldKey
  body: { value_json: string }
  调用 db/queries/character-state-values.js 中已有的 upsertCharacterStateValue(characterId, fieldKey, valueJson)
  返回 { success: true }

persona-state-values 路由（找到现有文件追加，或在 personas 路由中追加）：
- PATCH /api/worlds/:worldId/persona-state-values/:fieldKey
  body: { value_json: string }
  调用 db/queries/persona-state-values.js 中已有的 upsertPersonaStateValue(worldId, fieldKey, valueJson)
  返回 { success: true }

三、前端新增 API 函数

characterStateValues.js 新增：
- updateCharacterStateValue(characterId, fieldKey, valueJson)
  PATCH /api/characters/${characterId}/state-values/${fieldKey}，body: { value_json: valueJson }

personaStateValues.js 新增：
- updatePersonaStateValue(worldId, fieldKey, valueJson)
  PATCH /api/worlds/${worldId}/persona-state-values/${fieldKey}，body: { value_json: valueJson }

四、CharacterEditPage.jsx — 移除字段定义管理，改为状态值编辑

1. 移除 StateFieldList 及其相关 import（listCharacterStateFields 等）
2. 新增「当前状态字段值」区块：
   - 调用 getCharacterStateValues(characterId) 获取 { field_key, label, type, value_json }[]
   - 如果字段列表为空（该世界无角色状态字段），则不显示此区块
   - 为每个字段渲染对应的输入控件（根据 type）：
     - text → <Input> 或 <Textarea>（单行）
     - number → <Input type="number">
     - boolean → toggle/checkbox
     - enum → <select>（选项从 enum_options JSON 解析）
     - list → 用逗号分隔的文本输入（保存时转为 JSON 数组）
   - 每个控件失焦（onBlur）时调用 updateCharacterStateValue(characterId, fieldKey, JSON.stringify(newValue)) 保存
   - 初始值从 value_json 解析（JSON.parse）

五、CharactersPage.jsx — PersonaEditModal 同步处理

与第四步逻辑相同，将 StateFieldList 替换为玩家状态值编辑面板：
- 调用 getPersonaStateValues(worldId) 获取字段列表
- 同样按 type 渲染控件，失焦时调用 updatePersonaStateValue(worldId, fieldKey, JSON.stringify(newValue))

约束：
- 不改任何锁定文件
- 不新增路由文件，只在现有 character-state-values.js 和 persona 相关路由文件中追加
- StateFieldList 组件本身不改，只是调用方式变化
- value_json 存储格式与 LLM 自动更新时保持一致（字符串存字符串，数字存数字，布尔存 true/false，数组存数组）
```

**验证方法**：
1. 打开世界编辑弹窗，弹窗中依次显示「世界状态字段」「角色状态字段」「玩家状态字段」三组，各自可以新建/编辑/删除/拖拽排序
2. 打开角色编辑页，不再显示状态字段定义列表；若该世界有角色状态字段，显示「当前状态字段值」区块，每个字段有对应的输入控件
3. 修改角色的某个状态值并失焦，刷新页面后该值仍保留（成功写入数据库）
4. 打开玩家编辑弹窗，同样只显示状态值编辑面板，不显示字段定义管理
5. 若世界无角色/玩家状态字段，角色页/玩家弹窗的状态值区块不显示

---

### T40 ⬜ 记忆面板实时更新感知

**这个任务做什么**：AI 回复完成后，记忆面板自动显示「更新中…」动效，并轮询等待 LLM 异步更新状态字段，更新完成后实时刷新面板内容，无需手动刷新页面。

**涉及文件**：
- `frontend/src/store/index.js` — 新增 memoryRefreshTick 和 triggerMemoryRefresh
- `frontend/src/pages/ChatPage.jsx` — finalizeStream 中触发 refresh 信号
- `frontend/src/components/memory/MemoryPanel.jsx` — 订阅信号、轮询逻辑、更新中 UI

**Claude Code 指令**：

```
请先阅读 @CHANGELOG.md 与以下文件的现有内容：
- frontend/src/store/index.js
- frontend/src/pages/ChatPage.jsx（重点看 finalizeStream 函数）
- frontend/src/components/memory/MemoryPanel.jsx

任务：让记忆面板在 AI 回复完成后自动轮询刷新，显示更新中状态。

一、store/index.js 新增（不改现有字段）

在 create() 的 set 对象末尾追加：
- memoryRefreshTick: 0
- triggerMemoryRefresh: () => set((s) => ({ memoryRefreshTick: s.memoryRefreshTick + 1 }))

二、ChatPage.jsx — finalizeStream 末尾触发信号

在 finalizeStream 函数（useCallback）的最后，追加：
  if (streamingTextRef.current.length > 0 || true) {
    useStore.getState().triggerMemoryRefresh();
  }
注意：finalizeStream 是 useCallback，不是组件直接渲染函数，必须用 useStore.getState() 而非 useStore hook 调用。
triggerMemoryRefresh 在流式生成结束时调用（无论是正常结束、中断还是错误），因为后端即使中途保存了部分消息，也可能触发状态更新。

三、MemoryPanel.jsx — 轮询与更新中 UI

1. 在组件顶部新增 store 订阅：
   const tick = useStore((s) => s.memoryRefreshTick);

2. 新增 state：const [isPolling, setIsPolling] = useState(false);

3. 新增 useEffect，依赖 [tick]，仅在 tick > 0 时启动轮询：
   - 设置 isPolling = true
   - 保存当前四类数据的 JSON.stringify 快照（personaState、characterState、worldState、timeline）
   - 启动 setInterval，间隔 3000ms：
     - 重新拉取四类数据
     - 对比 JSON.stringify 是否与快照不同，若任意一项不同：更新面板数据、setIsPolling(false)、clearInterval
   - 启动 setTimeout(20000)：超时后 setIsPolling(false)、clearInterval（数据可能未变化，安静停止）
   - useEffect cleanup：clearInterval + clearTimeout

4. 在面板标题行右侧，当 isPolling === true 时显示：
   - 一个 2px × 2px 的圆点（背景色 var(--we-accent)），加 animate-pulse 脉冲动效
   - 文字「更新中…」（text-xs text-text-secondary）
   - 整体内联排列，不占新行

约束：
- store/index.js 只追加新字段，现有三个字段不动
- 轮询失败（API 报错）时 setIsPolling(false) 并 clearInterval，不显示错误（后台静默）
- 不改任何锁定文件
```

**验证方法**：
1. 在有状态字段（update_mode=llm_auto）的世界中发送一条消息
2. 流式生成结束后，记忆面板标题旁出现「● 更新中…」脉冲指示
3. 等待 LLM 异步更新状态完成（通常 5-15 秒），面板数据自动刷新，「更新中…」消失
4. 若 20 秒内数据无变化（如该世界无 llm_auto 字段），「更新中…」自动消失，无报错
5. 发送消息前后手动对比面板中的状态值，确认已反映最新状态

---

### T41 ⬜ 角色卡跨世界导入兼容性校验

**这个任务做什么**：导入角色卡 `.wechar.json` 前，前端比对角色卡的状态字段与目标世界模板，字段不匹配时报错阻止导入，避免无声丢失状态数据。

**涉及文件**：
- `frontend/src/pages/CharactersPage.jsx` — 导入入口的文件解析逻辑
- `frontend/src/api/characterStateFields.js` — 复用 listCharacterStateFields

**Claude Code 指令**：

```
请先阅读 @CHANGELOG.md 与以下文件的现有内容：
- frontend/src/pages/CharactersPage.jsx（找到导入角色卡的文件处理逻辑）
- frontend/src/api/characterStateFields.js
- frontend/src/api/importExport.js

任务：在前端导入角色卡前增加世界兼容性校验。

找到 CharactersPage.jsx 中处理 .wechar.json 文件上传/导入的逻辑（通常是一个 handleImport 函数或 onChange 处理器），在解析 JSON 后、调用 importCharacter API 前，插入以下校验逻辑：

1. 读取 data.character_state_values（可能为空数组或 undefined）
2. 若 character_state_values 为空或长度为 0，跳过校验，直接继续导入

3. 若 character_state_values 有数据：
   a. 调用 listCharacterStateFields(currentWorldId)（已有 API 函数）获取目标世界的字段定义列表
   b. 构造 worldFieldKeys = new Set(fields.map(f => f.field_key))
   c. 找出不兼容的 key：incompatibleKeys = data.character_state_values.filter(sv => !worldFieldKeys.has(sv.field_key)).map(sv => sv.field_key)
   d. 若 incompatibleKeys 长度 > 0：
      - 显示错误提示（toast error 或 alert），内容为：
        「导入失败：该角色卡包含与当前世界不兼容的状态字段：${incompatibleKeys.join('、')}。请在同一世界中导入。」
      - 终止导入（return，不调用 importCharacter API）
   e. 若 incompatibleKeys 为空 → 正常继续导入

4. 若目标世界无角色状态字段（fields 为空数组），但角色卡有 character_state_values：同样视为不兼容，报错终止

约束：
- 只改 CharactersPage.jsx，不改后端（后端的静默跳过逻辑保留作为保底）
- 不改任何锁定文件
- 错误提示样式与页面现有 toast/error 风格一致
```

**验证方法**：
1. 在世界 A（有 `hp`、`mp` 状态字段）导出角色卡，在世界 B（无这两个字段）尝试导入 → 前端弹出错误提示，列出「hp、mp」不兼容，导入终止，后端未被调用
2. 在同一世界导出再导入 → 正常成功
3. 导出一个无状态字段数据的角色卡（character_state_values 为空数组），在任意世界导入 → 正常成功，无校验弹窗
4. 世界 C 有字段 `mood`，世界 D 同样有字段 `mood`（field_key 相同），A 世界导出的带 `mood` 的角色卡在 D 世界导入 → 成功（字段名匹配）

---

### T42 ⬜ 无会话时发送消息自动建会话

**这个任务做什么**：角色没有历史会话时，用户在对话框输入消息直接发送，应自动创建新会话并继续发送，而不是静默丢弃消息。

**涉及文件**：
- `frontend/src/pages/ChatPage.jsx` — 修改 handleSend 函数
- `frontend/src/api/sessions.js` — 复用已有的 createSession 函数

**Claude Code 指令**：

```
请先阅读 @CHANGELOG.md 与以下文件的现有内容：
- frontend/src/pages/ChatPage.jsx（重点看 handleSend、enterSession、handleSessionCreate）
- frontend/src/api/sessions.js（确认 createSession 函数签名）

任务：handleSend 在无当前会话时自动建会话再发送。

修改 handleSend 函数（当前约在第 165 行）：

1. 将 handleSend 改为 async 函数

2. 将现有的第一行 guard：
   if (!currentSessionId || generating) return;
   改为两步：
   a. if (generating) return;
   b. 若 !currentSessionId：
      - 若 character 为 null（页面未加载完），return
      - 调用 const newSession = await createSession(character.id)
      - 调用 enterSession(newSession)（设置 currentSession 和 currentSessionId）
      - 将后续 sendMessage 调用中的 currentSessionId 替换为 newSession.id
        （因为 enterSession 是 setState，React 批量更新不会在同一 tick 生效，所以直接用 newSession.id）

3. 后续 sendMessage 调用（第 186 行左右）将 currentSessionId 改为：
   currentSessionId ?? newSession?.id
   或在函数顶部声明 const sessionId = currentSessionId ?? newSession?.id 统一使用

4. 左侧 Sidebar 的会话列表需要感知到新会话：
   查看 Sidebar 组件是否暴露了 addSession 或类似方法（通过 ref 或全局方法）；
   若有，在 enterSession 后调用；
   若无，可在建会话后调用 setMessageListKey((k) => k + 1) 触发 Sidebar 重新加载会话列表（Sidebar 可能通过 useEffect + characterId 自行拉取）

约束：
- 只改 ChatPage.jsx（sessions.js API 不改，createSession 已存在）
- 不改任何锁定文件
- 自动建会话只在 handleSend 中处理，handleContinue / handleImpersonate 等仍保持原有的 !currentSessionId 判断（这些操作必须有现有会话）
```

**验证方法**：
1. 进入一个无历史会话的角色页（角色刚创建，会话列表为空），在输入框输入消息并发送 → 自动创建新会话，消息正常流式生成
2. 左侧会话列表出现新会话，标题为「新对话」（待 LLM 生成标题后更新）
3. 后续在同一会话继续发送消息，行为与正常会话完全一致
4. 已有会话时发送消息，行为不变，不触发建会话逻辑
