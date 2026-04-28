# WorldEngine

AI 驱动的沉浸式角色扮演与创意写作工具。

## Overview

WorldEngine 解决的问题：**如何在长程 AI 对话中维护一个活的世界**。

普通 AI 对话工具每次开启都是白板，角色没有记忆、世界没有状态、设定随写随丢。WorldEngine 引入了完整的世界→角色→会话层级，每层有独立的提示词、状态字段和记忆，让 AI 在几十轮甚至几百轮后仍能感知"当前发生了什么"。

适合人群：
- 有世界观设定的创意写作者、互动小说爱好者
- TRPG 玩家 / GM，需要管理多角色和世界状态
- 想用 AI 辅助构建复杂角色系统与长程叙事的人

## Features

**世界管理**
- 卡片封面、名称、描述；支持世界级 LLM 参数覆盖全局配置
- 世界状态字段（如"政局稳定性""戒严等级"），支持 text / number / boolean / enum / list
- 每个会话有独立的状态快照，多会话互不干扰

**角色系统**
- 角色头像、系统提示词、生成参数、状态字段（如"好感度""当前情绪"）
- Persona（玩家身份），有独立状态字段集

**提示词条目**
四种触发类型，精细控制 AI 行为：
| 类型 | 触发时机 |
|---|---|
| `always` | 常驻，每轮必然注入 |
| `keyword` | 用户消息含关键词时触发 |
| `llm` | AI 判断语义相关时注入，按 token 权重排序 |
| `state` | 状态字段满足条件表达式时自动激活 |

**两种会话模式**
- **对话（Chat）**：气泡消息列表，单角色扮演，右侧实时状态面板
- **写作（Writing）**：散文段落排版，多角色协作，章节自动分组

**记忆系统**
- 每轮生成 10–50 字摘要 + 向量 embedding
- 新消息发送时语义召回相关历史片段，同 session 阈值 0.72，跨 session 阈值 0.84
- 决策引擎判断是否展开原文（智能展开）

**状态自动更新**
- `llm_auto` 模式：每轮 AI 回复后，由 LLM 解析对话内容自动更新世界/角色/玩家状态
- `manual` 模式：仅用户手动编辑

**写卡助手**
挂载在界面右侧的 AI 代理面板，以提案（Proposal）方式辅助用户构建世界、角色、Persona 和全局配置，用户逐条确认后方执行，SSE 实时推送进度。

**正则替换**
四种作用域（`user_input` / `ai_output` / `display_only` / `prompt_only`），可按对话/写作模式分别生效。

**自定义 CSS**
全局和世界级 CSS 片段，拼接注入 `<style id="we-custom-css">`。

**多 LLM 支持**
Anthropic Claude、OpenAI GPT、OpenAI 兼容接口（DeepSeek、SiliconFlow 等）、Google Gemini、Ollama 本地模型；模型下拉直接显示每百万 token 价格。

**导入导出**
- `.wechar.json` — 单角色（含状态字段）
- `.weworld.json` — 完整世界（含所有角色、配置、会话历史）
- `.weglobal.json` — 全局设置（提示词、CSS、正则，不含 API Key）

**桌面应用**
Electron 打包，支持 macOS（x64 / arm64）和 Windows（x64），数据存用户目录，随机端口避免冲突。

## 社区交流

QQ 群：**964968606**

## Quick Start

**环境要求**：Node.js 18+

```bash
# 克隆仓库
git clone https://github.com/n0ctx/WorldEngine.git
cd WorldEngine

# 安装依赖
npm install --prefix frontend
npm install --prefix backend

# 启动开发服务器（两个终端）
cd frontend && npm run dev   # http://localhost:5173
cd backend  && npm run dev   # http://localhost:3000
```

首次启动后在设置页填入 LLM 提供商的 API Key，然后：

1. 新建世界
2. 在世界内新建角色
3. 开启对话或写作会话

## Usage

**重置数据库（开发用）**

```bash
cd backend && npm run db:reset
```

**构建前端**

```bash
cd frontend && npm run build
```

**打包桌面应用**

```bash
# 首次打包前下载 Node runtime（约需几分钟）
npm run desktop:dist
```

打包产物在 `desktop/dist/`。数据目录：
- macOS：`~/Library/Application Support/worldengine-desktop/`
- Windows：`%APPDATA%\worldengine-desktop\`

**日志**

日志文件位于 `data/logs/worldengine-YYYY-MM-DD.log`，级别通过 `data/config.json` 的 `logging` 配置块控制。
