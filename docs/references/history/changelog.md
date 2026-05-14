# History Changelog

每条改动一行，格式：`- **<type>: <一句话标题>** — <核心动作 / 关键文件 / 兼容性要点，控制在 1–2 句内>`。

新条目追加在列表顶部；细节查 git log，本文件只承担"为什么现在长这样"的索引。

---

- **fix: assistant 消息脚注激活条目超宽截断** — `ActivatedEntriesRow` 改用 `useLayoutEffect` + ResizeObserver 直接 DOM 操作，保持单行同行展示，超宽时显示 `+n` badge，token stat span 加 `flex-shrink: 0` + `white-space: nowrap` 防止"命中"被拆字；`chat.css` + `ActivatedEntriesRow.jsx`。
- **fix: SectionTabs 内 chip 按钮样式丢失** — `.we-panel-card-action--chip` 及基础 action 样式仅对 `.we-panel-card-actions` 父级生效，`SectionTabs` 将 tab actions 渲染到 `.we-section-tabs-globals` / `.we-section-tabs-actions`，导致 NearbyPanel「制卡/保存/移除」等按钮边框/背景全部丢失；`ui.css` 将三组选择器统一追加 `.we-section-tabs-globals` / `.we-section-tabs-actions` 变体。
- **fix: `shells/book-spread/` UI 规范审计 BLOCKER 全量修复** — 去除 `pageLayoutRenderer` 的 `!p-0` 越权（`PageRight` 新增 `flush` 变体 + `.we-page-right--flush` / `.we-page-right__body`）；`MemoryRecallOverlay` 改用 `.we-memory-recall*` 语义类，弃用 Tailwind 任意值 `min-h-[32px]` 与裸 opacity `/75` `/55`；`TopBar` 按钮文案去装饰符（`✦ 助手` → `助手`、`前往世界列表 →` → `前往世界列表`）、`caret` 与 `dropdown` 的 `display:inline-block` / `transform-origin` 迁回 ui.css；`PageTransition` 容器布局抽到 `.we-page-transition`，shell 层彻底无 inline style。
- **fix: 修复 `pages.css` 中 `.we-marginalia::before` 内容被错位到文件末尾导致大段规则被 CSS 嵌套吞掉** — 第 3344 行的 `::before` 仅剩空括号开闭,真正的 `content/position/...` 声明出现在文件末尾(3849 行附近)作为孤立块,触发原生 CSS 嵌套,使 3344–3849 之间的 `.we-session-list-create` 等几百条规则变成 `.we-marginalia::before .we-xxx` 永不命中;表现为 chat/写作页"新建会话"按钮无边框、`+` 图标与文本断行。把内容搬回 `::before` 块内并删除末尾孤立片段。
- **chore: `shells/book-spread/components/` 改名 `chrome/`** — 与通用 `frontend/src/components/` 命名解耦,语义贴近 shell chrome;同步 `AppShell.jsx` / `layout/pageLayoutRenderer.jsx` 两处 import 与 AppShell 顶部注释。
- **refactor: index.css 组件 CSS 按域拆到 themes/{ui,pages,chat}.css + 主题可配置面扩到排版节奏** — `frontend/src/index.css` 2438 → 94 行（保留 :root 基线 / utility / prefers-reduced-motion），组件规则全量迁移；`themes/tokens.css` 新增 `--we-tracking-*` 六档字距 scale；字号/行高/圆角/duration/字距全部 token 化；可达性 outline:none 配 focus-visible 替代；`themes/README.md` 推荐覆盖顺序补 §7 排版节奏，`themes/_template/theme.css` 加 §7 注释段；现有 `classic-parchment` / `lovable-cream` 无需改动（沿用默认值，零视觉变化）。
- **refactor: 将 `classic-parchment` shell 更名为 `book-spread`** — `frontend/src/shells/classic-parchment/` 改名 `book-spread/`，`selectShell.js` 同步 import/`DEFAULT_SHELL_ID`/`SHELLS`；主题包 `themes/classic-parchment/` 保持原名不动，区分"shell（结构）"与"theme（token）"。
- **chore: `ui.css` 死代码清理与可达性补丁** — 删除 `.we-btn-icon`/`.we-scope-row`/`.we-scope-check`/`.we-checkbox` 零引用类；抽取公共纤细滚动条 utility；状态 tag close 按钮命中区扩至 32×32；`RegexRulesManager` icon 按钮补 `aria-label`。
- **refactor: `ui.css` UI 规范整改，字号/行高/焦点环/弹窗阴影全部 token 化** — `tokens.css` 新增 `--we-text-2xs/-body/-control/-display`、`--we-leading-flush/-snug`、`--we-shadow-dialog`、`--we-focus-ring`；`ui.css` 替换约 60 处裸值；0.5px 字号统一就近圆整，产生轻微视觉位移。
- **refactor: `pages.css` UI 规范全量整改，所有裸值替换为设计 token** — 消除 9 类裸值违规（rgb/radius/z-index/transition/font-size/gap/padding/margin/clamp），约 330 处裸值替换；采用"就近吸附"策略，全站存在轻量视觉位移待人工巡检。
- **chore: 清理 11 个僵尸 CSS token，`check:tokens` 归零** — 删除 `tokens.css` 与三套主题里没有任何 `var()` 引用的 11 个令牌；`check:tokens` 现为 194 声明 / 194 引用。
- **refactor: 收敛 `frontend/src/index.css` 内 T29A 设计令牌块到 `tokens.css` 真源** — 删除 T29A 并行命名 token 与 `@theme` 块；JSX 改用 `[var(--we-color-*)]` arbitrary value；`--we-radius-md` 由 12px 回退到 `tokens.css` 8px。
- **fix: 修复 6 个 CSS 设计令牌孤儿引用并新增 token 健康检查脚本** — 新增 `npm run check:tokens` 并入 `lint`；修正 `ErrorBoundary` 用 `--we-color-bg-surface`、`pages.css` 用 `--we-duration-normal`；`tokens.css` 补 4 个运行时 token 默认值。
- **fix: 收紧编辑页标题与 tabs 之间的空白并对齐左边界** — `pages.css` 收口编辑页 `SectionTabs` 纵向 gap、tab 内边距与左侧校正。
- **fix: 关闭世界与角色类创建抽屉的成功态卡死问题** — 创建成功后 overlay 分支不再 `replace` 到编辑页而是返回背景页；直达创建会主动清 `saving` 并开加载态。
- **fix: 将世界卡底部角色数与时间移到左下角** — `pages.css` 调整 `we-world-card-meta` 绝对定位至左下角。
- **fix: 拉开世界书架首排卡片与外框的顶部距离** — `we-worlds-bookshelf` 增加顶部 padding 并同步移动端。
- **fix: 轻微下移世界页右侧操作按钮组** — 桌面端 `we-worlds-header-actions` 微调对齐，移动端重置。
- **fix: 收紧世界书架顶部留白并把卡片区整体上提** — 收紧 `WorldsPage` 画布/页头/书架的垂直节奏。
- **fix: 清理后端测试子进程继承的 mock LLM 环境污染** — `backend/tests/helpers/test-env.js` 新增净化子进程 env helper；`llm/index.test.js`、`server-hooks.test.js` 接入。
- **fix: 统一编辑框焦点外框并删除红色高亮残留样式** — 通用 input/textarea/聊天/章节标题焦点统一到中性外圈，删除遗留红框规则（`ui.css`/`chat.css`/`index.css`）。
- **fix: 移除世界页层板承托并收口为纯容器书架** — `WorldsPage` 删除按行测量逻辑与 plank 主题 token，回归"容器+卡片"。
- **fix: 为世界页补中性书架骨架并拆分主题风格化出口** — 核心层新增 frame/back-panel/plank/plain-card token，由 `classic-parchment`/`lovable-cream` 分别覆写。
- **fix: 对齐书架页三列表头的分隔线高度** — `we-characters-col-header` 增加统一最小高度。
- **fix: 将设置弹窗加载态改为轻度模糊遮罩** — `SettingsPage` 移除"加载中…"文字，改为带 `role="status"` 的轻模糊 scrim。
- **fix: 将更多 provider 的模型价格改为动态拉取官方定价页** — `routes/config.js` 扩展 Gemini/Grok/DeepSeek/Kimi/Qwen/SiliconFlow 动态抓取 + TTL 缓存 + 静态兜底。
- **fix: 将设置页默认排版从宽松展示板收束为紧凑工作台** — `FormGroup`/`FieldLabel` 新增 `settings` 变体；统一控件密度与导航活跃态。
- **fix: 统一设置页下拉框与输入框的表单基线** — `Select`/`ModelCombobox` 字号/行高/盒模型对齐 `Input`；新增 `we-settings-inline-field-row`。
- **fix: 统一右侧状态栏空值字段不再显示"点击编辑"** — `StatusSection` 空态走统一占位常量，移除 tooltip。
- **fix: 去掉状态栏编辑态内部控件的重复焦点框** — `we-status-inline-surface` 内统一关闭 input/textarea/tag/select 的内层 focus。
- **fix: 状态栏文本字段编辑改为支持自动换行** — text 字段 inline editor 由单行 input 切到 textarea，`Ctrl/Cmd+Enter` 提交。
- **fix: 允许多行列表编辑在必要时突破阅读态高度** — `SeamlessEditableSurface` 高度测量取 `max(rectHeight, scrollHeight)`，列表编辑器解除 `overflow:hidden`。
- **fix: 修正会话状态枚举选项缺失与列表编辑态尺寸漂移** — `session-state-values` 查询补 `enum_options`；列表 inline editor 收敛 tag/删除按钮盒模型。
- **fix: 修正状态栏列表编辑换行溢出与下拉开向判断** — shared surface 支持非 textarea 测量；`Select` 改为参考最近裁剪祖先判向。
- **fix: 收敛消息与状态字段的无缝编辑态切换** — 新增 `SeamlessEditableSurface`/`useSeamlessEditLayout`，chat/writing/assistant 与 status 字段全部接入镜像层。
- **fix: 右侧状态栏改为按字段类型内联编辑且放开 llm_auto 手改** — `StatusSection` 按类型切换编辑器；可编辑性仅排除 `system_rule`。
- **fix: 为副模型后台整理补上超时护栏与失败提示** — aux LLM 任务可配置超时（默认 20s），新增 `postprocess_failed` SSE 事件，前端弹 toast。
- **fix: 稳定 chat/write 历史消息的同毫秒排序与截断行为** — `messages` 查询按 `created_at ASC, rowid ASC` 排序；截断辅助同步语义。
- **docs: 将 CLAUDE 根入口从主轴选择改为任务场景路由** — `CLAUDE.md` 改为"先按任务场景选首读链路"；各主轴 `index.md` 补跨模块片段。
- **docs: 精简 CLAUDE.md 入口结构并压缩重复导航信息** — 压缩为"工作原则/任务分流/真源与同步"三段式。
- **fix: 修正 think 块内重复标签导致前缀正文外泄的解析错误** — 新增 `core/utils/think-blocks.js` 状态机解析；chat/writing/assistant 消息渲染统一接入。
