# History Changelog

遵守以下格式在正文最上方追加条目：
## <type>: <一句话说明本次改动>

- **对外接口/用户入口**：说明新增、修改或删除了哪些 API、页面入口、按钮、命令、配置项等对外可感知的能力；如果没有对外入口，明确写“无”。
- **核心行为**：说明本次改动实现了什么功能、改变了什么流程、输入输出是什么、关键数据格式是什么。
- **涉及文件**：列出主要修改文件，并简要说明每个文件承担的改动职责，不只罗列文件名。
- **数据/兼容性约束**：说明数据库字段、历史数据、缺省值、格式兼容、迁移、空值处理等需要特别注意的地方；如果无特殊约束，明确写“无”。
- **UI/交互变化**：说明页面、按钮、布局、文案、状态反馈等变化；如果不涉及 UI，明确写“无”。
- **注意事项**：记录实现中容易被误改、遗漏或需要后续维护者特别知道的细节。

---
以下为CHANGELOG正文部分

## fix: 右侧状态栏改为按字段类型内联编辑且放开 llm_auto 手改

- **对外接口/用户入口**：chat / writing 会话页右侧状态栏中的世界、玩家、角色与 nearby 状态字段，现已统一支持直接在侧栏内按类型编辑；不再只允许 `manual` 字段手改。
- **核心行为**：`StatusSection` 现在按字段类型切换不同编辑器：文本/数值保持内联输入，枚举改为下拉选择，列表改为标签式输入并通过回车逐项添加，表格继续按单元格点击编辑；可编辑性改为仅排除 `system_rule`，`llm_auto` 字段也允许手动覆写当前会话值，而后台自动状态整理仍只会继续处理 `llm_auto` 字段。
- **涉及文件**：`frontend/src/components/state/StatusSection.jsx` 重写右栏状态字段内联编辑逻辑并新增列表标签编辑器；`frontend/tests/components/state/StatusSection.test.jsx` 补充 `llm_auto` 可手改、`system_rule` 不可改、列表回车添加的回归测试；`docs/references/backend/memory-and-state.md` 同步 `update_mode` 的真实语义。
- **数据/兼容性约束**：不改数据库结构；仍沿用会话级 `runtime_value_json` 覆写全局默认值，`system_rule` 字段继续禁止手动编辑，`manual` 与 `llm_auto` 的差异只体现在后台是否自动更新。
- **UI/交互变化**：右栏状态字段的编辑体验对齐角色编辑页：列表以标签方式增删，枚举通过下拉选择，表格按单元格编辑；`llm_auto` 字段不再表现为只读。
- **注意事项**：`combined-state-updater` 依旧只筛选 `update_mode === 'llm_auto'` 的字段，后续若再调整 `update_mode` 语义，必须同时检查右栏编辑权限和后台状态更新筛选是否仍一致。

## fix: 为副模型后台整理补上超时护栏与失败提示

- **对外接口/用户入口**：chat / writing 在主回复完成后，如果标题生成、状态整理、turn summary 或长期记忆压缩等副模型后台任务失败或超时，会显示明确 toast；不再只停在“正在记录记忆…”。
- **核心行为**：为后台 aux LLM 非流式任务增加可配置超时（默认 20 秒，`WE_LLM_BACKGROUND_TASK_TIMEOUT_MS` 可覆写），超时后统一按 504 失败处理；状态整理继续发 `state_update_failed`，其余 keep-alive 后处理新增 `postprocess_failed` SSE 事件，让前端能收起记忆提示并展示“失败/超时”反馈。
- **涉及文件**：`backend/llm/index.js` 为非流式 complete/tool-loop 增加 timeout signal；`backend/memory/combined-state-updater.js`、`backend/memory/turn-summarizer.js`、`backend/memory/title-generation.js`、`backend/services/long-term-memory.js` 接入后台超时；`backend/utils/post-gen-runner.js` 为非 state keep-alive 任务补发 `postprocess_failed`；`frontend/src/core/api/stream-parser.js`、`frontend/src/pages/ChatPage/index.jsx`、`frontend/src/pages/WritingSpacePage/index.jsx` 处理新事件并弹 toast；相关前后端测试补上超时/事件分发回归。
- **数据/兼容性约束**：不改数据库结构；超时仅作用于显式传入 `timeoutMs` 的后台非流式任务，主对话流式生成不受影响。
- **UI/交互变化**：后台整理失败时会出现“后台整理失败，回复已保留，标题或状态可能未更新”；超时时会出现对应“后台整理超时”提示，并收起“正在记录记忆…”。
- **注意事项**：`postprocess_failed` 只用于非 `tracksState` 的 keep-alive 后处理；状态整理仍保留单独的 `state_update_failed` 语义，后续新增 keep-alive 任务时需明确选哪条事件链。

## fix: 稳定 chat/write 历史消息的同毫秒排序与截断行为

- **对外接口/用户入口**：无。
- **核心行为**：`messages` 底层查询改为按 `created_at ASC, rowid ASC` 稳定排序，避免 chat/write 会话在多条消息落在同一毫秒时出现历史顺序错乱；同时 `deleteMessagesAfter` / `getMessageIdsAfter` 改为按相同顺序语义判定“之后的消息”，确保同时间戳下的后续消息也会被正确截断。
- **涉及文件**：`backend/db/queries/messages.js` 为消息列表、未压缩上下文窗口和截断辅助查询补上 `rowid` tie-breaker；`backend/tests/db/queries/messages.test.js` 新增同毫秒插入顺序与同毫秒截断回归测试；`docs/references/history/changelog.md` 记录这次排序修复。
- **数据/兼容性约束**：不改表结构；依赖 SQLite 默认 `rowid` 作为同 `created_at` 下的稳定插入顺序补偿，对已有历史数据即时生效。
- **UI/交互变化**：chat 与 writing 页面重新加载历史会话时，不再因为同毫秒消息并列而出现展示顺序漂移。
- **注意事项**：后续如果把 `messages` 表改成 `WITHOUT ROWID` 或迁移到不具备等价隐式插入序的存储层，需要同步替换这套 tie-breaker，否则历史顺序问题会回归。

## docs: 将 CLAUDE 根入口从主轴选择改为任务场景路由

- **对外接口/用户入口**：`CLAUDE.md` 的 agent 冷启动入口由“先选 frontend/backend/assistant 等主轴”调整为“先按任务场景选首读链路”，新增恢复链路、chat/writing 流式链路、导入导出等跨模块任务入口。
- **核心行为**：保留 `docs/references/frontend/`、`backend/`、`assistant/`、`shared/`、`product/`、`history/` 六大知识主轴作为事实真源容器，不重做叶子文档归属；改为只在根入口和各主轴 `index.md` 上补任务导向导航，让跨模块任务先命中首读链路，再进入代码边界真源。
- **涉及文件**：`CLAUDE.md` 重写任务分流表并明确“任务导向只负责路由”；`docs/references/backend/index.md`、`frontend/index.md`、`assistant/index.md`、`shared/index.md`、`product/index.md`、`history/index.md` 新增“本主轴承接的高频跨模块任务片段”；`docs/references/history/changelog.md` 记录这次入口路由策略调整。
- **数据/兼容性约束**：无。
- **UI/交互变化**：无。
- **注意事项**：这次只把入口层任务化，不把 `docs/references/` 改成纯任务树；后续新增跨模块场景时，应先补 `CLAUDE.md` 首读链路和相关主轴 `index.md`，不要在叶子页重复搬运事实。

## docs: 精简 CLAUDE.md 入口结构并压缩重复导航信息

- **对外接口/用户入口**：无。
- **核心行为**：将 `CLAUDE.md` 从“行动原则 / 冷启动默认读取 / 按任务落点阅读什么 / 权威来源边界 / 文档同步触发器 / 快速提醒”压缩为“工作原则 / 任务分流 / 真源与同步”三段式，保留原有 `docs/references` 主轴、路由链路与同步约束，只减少重复说明。
- **涉及文件**：`CLAUDE.md` 精简入口结构并合并重复块；`docs/references/history/changelog.md` 记录这次文档入口收口调整。
- **数据/兼容性约束**：无。
- **UI/交互变化**：无。
- **注意事项**：这次只做入口瘦身，不改变 `docs/references/frontend|backend|assistant|shared|product|history` 六大主轴；后续若继续优化，应优先压缩入口重复信息，不要把细节重新塞回根入口。

## fix: 修正 think 块内重复标签导致前缀正文外泄的解析错误

- **对外接口/用户入口**：无。
- **核心行为**：前端 chat / writing 消息渲染改为按状态机扫描 `<think>` 与 `</think>`；一旦进入 think 块，直到首次闭合前都不会把内部重复出现的 `<think>` 重新当成新块起点，从而避免前缀思考内容被错误渲染到块外。补充前端回归测试，确认 think 内的 `<next_prompt>` 仍不会被解析成选项区。
- **涉及文件**：`frontend/src/core/utils/think-blocks.js` 新增共享 think 分段解析器；`frontend/src/components/chat/MessageItem.jsx` 与 `frontend/src/components/writing/WritingMessageItem.jsx` 改为复用共享实现；`frontend/tests/utils/think-blocks.test.js` 覆盖嵌套 think、孤立闭合标签、未闭合 think 与 think 内 next_prompt 场景；`assistant/client/MessageList.jsx` 同步修正卷宗流里的 think 分段逻辑。
- **数据/兼容性约束**：无。
- **UI/交互变化**：聊天与写作界面的思考折叠块在遇到 think 内字面标签时不再把前半段思考内容泄漏到正文区域。
- **注意事项**：`next_prompt` 的“先剥 think 再解析”逻辑仍保留，后续若继续调整流式协议，需同时验证 think 块分段与 next_prompt 提取两条链路。
