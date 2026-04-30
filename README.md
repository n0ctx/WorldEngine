# WorldEngine

**本地优先的 AI 角色扮演引擎**  
状态驱动叙事 · 分层记忆召回 · 动态提示词注入 · Chat / Writing 双模式

---

## 为什么不用普通 AI 聊天？

|  | 普通 AI 聊天 | WorldEngine |
|---|---|---|
| 剧情记忆 | 超出上下文即遗忘 | 向量召回，百轮后仍可检索 |
| 角色状态 | 需要手动在每轮提示词中重申 | 状态字段自动追踪、自动更新 |
| 世界设定 | 随对话漂移，难以保持一致 | 世界级 + 角色级分层提示词，层级不可覆盖 |
| 长期叙事 | 每次开新对话从头开始 | 多会话共享记忆，剧情可持续推进 |
| 提示词管理 | 每轮手动粘贴 | 4 种触发类型自动注入，语义相关时才激活 |

适合：有世界观的创意写作者 · 互动小说爱好者 · TRPG 玩家与 GM · 想让 AI 长期扮演复杂角色的人

---

## 快速上手

### 方式一：下载桌面版（无需 Node.js）

前往 [Releases](https://github.com/n0ctx/WorldEngine/releases) 下载对应平台安装包，安装后在设置页填入 LLM API Key 即可使用。支持 macOS（Intel / Apple Silicon）和 Windows（x64）。

### 方式二：一键脚本启动（需要 Node.js 18+）

克隆仓库后，直接双击对应脚本，自动安装依赖、启动前后端并打开浏览器：

- **macOS**：双击 `启动WorldEngine.command`（首次需在终端执行 `chmod +x 启动WorldEngine.command` 赋予执行权限）
- **Windows**：双击 `启动WorldEngine.bat`

### 方式三：手动启动（需要 Node.js 18+）

```bash
git clone https://github.com/n0ctx/WorldEngine.git
cd WorldEngine

npm install --prefix frontend
npm install --prefix backend

# 两个终端分别启动
cd frontend && npm run dev   # http://localhost:5173
cd backend  && npm run dev   # http://localhost:3000
```

首次启动后在设置页填入 LLM 提供商的 API Key，然后新建世界 → 新建角色 → 开启对话或写作会话。

---

## 核心能力

### 动态提示词注入

提示词条目支持 4 种触发类型，精细控制每轮注入哪些信息：

| 类型 | 触发时机 |
|---|---|
| `always` | 常驻，每轮必然注入 |
| `keyword` | 用户消息含关键词时触发 |
| `llm` | AI 预判语义相关时注入，按 token 权重排序 |
| `state` | 状态字段满足条件表达式时自动激活 |

常驻条目走 Prompt Cache 层，每轮不重复计费；语义条目按当前上下文按需召回，不注入无关内容。

### 分层记忆系统

每轮 AI 回复后异步生成摘要并建向量索引。新消息发送时，语义召回历史相关片段注入上下文，同 session 阈值 0.6，跨 session 默认关闭可手动开启。LLM进一步判断是否展开原文（智能展开），在保持上下文简洁的同时让细节可追溯。长期记忆通过独立的 `memory.md` 文件持久化，按轮次快照，支持随消息回滚还原。

### 状态驱动叙事

世界、角色、玩家（Persona）各自拥有独立的状态字段，支持 text / number / boolean / enum / list 五种类型。`llm_auto` 模式下每轮 AI 回复后自动解析并更新状态；每个会话有独立的状态快照，多会话互不干扰。状态值可以直接触发对应的提示词条目，让场景变化自动带入上下文。

### Chat / Writing 双模式

- **对话（Chat）**：气泡消息列表，单角色扮演，右侧实时状态面板，支持重新生成、续写、模拟、编辑。
- **写作（Writing）**：散文段落排版，多角色协作，章节自动分组并生成标题，AI 统筹所有激活角色的行为。

### 写卡助手

挂载在界面右侧的 AI 代理面板。以提案（Proposal）方式辅助构建世界、角色、Persona 和全局配置，用户逐条确认后方执行，SSE 实时推送进度。不参与剧情对话，只做配置层的修改。

---

## 技术架构速览

```
全局配置
  └─ 世界（提示词、状态字段、正则规则、CSS）
       └─ 角色（系统提示词、状态字段、生成参数）
            └─ 会话（状态快照、消息历史、turn record）
```

Prompt 按 14 段顺序组装，前 4 段走 Prompt Cache 层（全局提示词 + Persona + 角色 system prompt + 常驻条目），后续段动态拼接（状态、召回摘要、历史消息、后置提示词、当前消息）。各 provider 缓存策略自动适配（Anthropic `cache_control`、OpenAI-compatible 稳定前缀、Gemini explicit cache）。

技术栈：React 18 + Vite + TailwindCSS + Zustand（前端）/ Node.js + Express + ES Modules（后端）/ SQLite（better-sqlite3）/ OpenAI 或 Ollama embeddings（可选）/ Electron（桌面端）

LLM 支持：Anthropic Claude · OpenAI GPT · OpenAI 兼容接口（DeepSeek / SiliconFlow / Grok 等）· Google Gemini · Ollama 本地模型

---

## 文档

| 文档 | 说明 |
|---|---|
| [快速上手](docs/getting-started.md) | 安装、配置 API Key、第一个世界 |
| [核心概念](docs/concepts.md) | 世界 / 角色 / 状态 / 记忆系统的设计思路 |
| [Prompt 组装机制](docs/prompt-assembly.md) | 14 段提示词组装顺序与缓存策略 |
| [记忆系统](docs/memory-system.md) | 向量召回、摘要、长期记忆与回滚 |
| [状态系统](docs/state-system.md) | 状态字段、自动更新、会话隔离与回滚 |
| [桌面端](docs/desktop.md) | Electron 打包、数据目录、构建命令 |

---

## 导入导出格式

| 格式 | 内容 |
|---|---|
| `.wechar.json` | 单角色（含状态字段定义和默认值） |
| `.weworld.json` | 完整世界（含所有角色、配置、会话历史） |
| `.weglobal.json` | 全局设置（提示词、CSS、正则，不含 API Key） |

---

## 社区

QQ 群：**964968606**

---

## 开发命令

```bash
# 重置数据库（开发用）
cd backend && npm run db:reset

# 构建前端
cd frontend && npm run build

# 打包桌面应用（首次需下载 Node runtime，约需几分钟）
npm run desktop:dist
```

打包产物在 `desktop/dist/`。数据目录：macOS `~/Library/Application Support/worldengine-desktop/`，Windows `%APPDATA%\worldengine-desktop\`。

日志文件位于 `data/logs/worldengine-YYYY-MM-DD.log`，级别通过 `data/config.json` 的 `logging` 配置块控制。
