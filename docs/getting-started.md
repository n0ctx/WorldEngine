# 快速上手

本文帮助你完成 WorldEngine 的安装和初次配置，并创建你的第一个对话会话。

---

## 环境要求

- **桌面版**：无额外要求，直接下载安装包
- **开发模式**：Node.js 18+（建议 LTS 版本）
- **LLM API Key**：支持 Anthropic Claude / OpenAI / DeepSeek / SiliconFlow / Google Gemini / Ollama 本地模型

---

## 方式一：下载桌面版（推荐）

1. 前往 [Releases 页面](https://github.com/n0ctx/WorldEngine/releases) 下载最新版本：
   - **macOS（Apple Silicon）**：下载 `WorldEngine-*-arm64.dmg`
   - **macOS（Intel）**：下载 `WorldEngine-*-x64.dmg`
   - **Windows**：下载 `WorldEngine-*-x64-setup.exe`

2. 安装并启动应用。

3. 进入**设置页**，在 LLM 配置区域填入你的 API Key，选择提供商和模型。

4. 完成，可以开始使用了。

桌面版的数据存储在用户目录，不依赖开发环境：
- macOS：`~/Library/Application Support/worldengine-desktop/`
- Windows：`%APPDATA%\worldengine-desktop\`

---

## 方式二：一键脚本启动（需要 Node.js 18+）

克隆仓库后，直接双击脚本，自动完成依赖安装、前后端启动并打开浏览器，无需手动操作终端：

- **macOS**：双击 `启动WorldEngine.command`

  > 首次使用需要先赋予执行权限：
  > ```bash
  > chmod +x 启动WorldEngine.command
  > ```
  > 之后每次双击即可。

- **Windows**：双击 `启动WorldEngine.bat`

浏览器会在约 4 秒后自动打开 `http://localhost:5173`。

## 方式三：手动启动（需要 Node.js 18+）

适合想修改代码或自定义功能的用户。

**1. 克隆仓库**

```bash
git clone https://github.com/n0ctx/WorldEngine.git
cd WorldEngine
```

**2. 安装依赖**

```bash
npm install --prefix frontend
npm install --prefix backend
```

**3. 启动服务（需要两个终端窗口）**

终端 1（后端）：
```bash
cd backend && npm run dev
# 服务启动在 http://localhost:3000
```

终端 2（前端）：
```bash
cd frontend && npm run dev
# 服务启动在 http://localhost:5173
```

**4. 打开浏览器**

访问 `http://localhost:5173`，进入设置页填写 API Key。

---

## 配置 LLM

WorldEngine 支持多家 LLM 提供商。进入**设置页 → LLM 配置**：

| 提供商 | 需要 | 说明 |
|---|---|---|
| Anthropic Claude | API Key | claude-3-5-sonnet 等 |
| OpenAI | API Key | gpt-4o 等 |
| OpenAI 兼容接口 | API Key + Base URL | DeepSeek、SiliconFlow、Grok 等 |
| Google Gemini | API Key | gemini-2.5-pro 等 |
| Ollama | 无（本地运行） | 需要先启动 Ollama 服务 |

如果你有 Ollama，可以完全免费在本地运行，不需要任何 API Key。

**副模型（可选）**：后台摘要、状态更新、记忆展开等任务使用副模型（`aux_llm`），可以配置为比主模型更便宜的小模型。不配置时自动回退到主模型。

---

## 创建第一个世界

1. 点击**新建世界**，填写世界名称和描述（描述会影响 AI 的整体氛围）。

2. 进入世界后，点击**新建角色**，填写：
   - 角色名称
   - 系统提示词（描述角色的性格、背景、说话方式）
   - 可选：上传角色头像

3. 点击角色卡片，选择**开始对话**，进入对话页。

4. 在输入框发送第一条消息，AI 将以角色身份回应。

---

## 下一步

- [核心概念](concepts.md)：理解世界 / 角色 / 状态 / 记忆的设计思路
- [Prompt 组装机制](prompt-assembly.md)：了解 WorldEngine 如何组装每轮的提示词
- [记忆系统](memory-system.md)：长期记忆和向量召回如何工作
- [状态系统](state-system.md)：状态字段、自动更新和触发条件

---

## 常见问题

**Q：第一条消息发出去没有回应？**  
检查设置页的 API Key 是否填写正确，以及选择的模型是否可用。浏览器控制台（F12）或后端日志（`data/logs/worldengine-*.log`）会有详细错误信息。

**Q：如何重置数据库？**  
```bash
cd backend && npm run db:reset
```
这会清空所有数据，仅在开发调试时使用。

**Q：日志文件在哪里？**  
`data/logs/worldengine-YYYY-MM-DD.log`，按天轮换。日志级别通过 `data/config.json` 的 `logging` 配置块控制。

**Q：桌面版和开发模式的数据能互通吗？**  
不能直接互通，两者的数据目录不同。可以通过导出/导入 `.weworld.json` 或 `.wechar.json` 迁移角色和世界数据。
