# WorldEngine WSL 迁移指南

将 WorldEngine 项目迁移到 WSL（Windows Subsystem for Linux）后，仍可从 Windows 访问。本文档提供迁移步骤和使用方式。

## 前提条件

- WSL2 已安装并运行 Ubuntu（推荐）或其他 Linux 发行版
- Node.js ≥ 20.19 或 ≥ 22.12（WSL 内安装）
- Git（用于代码管理和换行符标准化）

## 迁移步骤

### 1. 在 WSL 中克隆项目

```bash
cd ~
git clone https://github.com/your-org/worldengine.git
cd worldengine
```

### 2. 设置换行符标准化

WSL/Linux 环境默认使用 LF，Windows 使用 CRLF。`.gitattributes` 已配置为跨平台一致性：

```bash
# 设置 WSL/Linux 的 git 行为（LF in repo, LF on disk)
git config --global core.autocrlf input
```

### 3. 安装依赖

```bash
npm install
npm install --prefix backend
```

### 4. 使用 worldengine CLI 启动

**WSL/POSIX:**
```bash
worldengine start
# 或 npm run dev（手动方式）
```

**Windows CMD:**
```cmd
worldengine.cmd start
```

CLI 会自动：
- 检测运行环境（WSL / Windows / POSIX）
- 设置 `HOST=0.0.0.0`（跨平台可访问）
- 等待后端就绪后打开浏览器
- 管理依赖安装和更新

### 5. 从 Windows 访问

在 WSL 中启动服务后，Windows 浏览器直接访问：

```
http://localhost:5173
```

WSL2 与 Windows 共享网络命名空间，端口转发自动完成。

## CLI 命令参考

| 命令 | 描述 |
|------|------|
| `worldengine start` | 启动开发服务器（前端 + 后端） |
| `worldengine install` | 仅安装依赖 |
| `worldengine update` | 更新 npm 包 |
| `worldengine help` | 显示帮助信息 |

## 环境变量

| 变量 | 默认值 | 描述 |
|------|--------|------|
| `HOST` | `0.0.0.0`（WSL）/ `127.0.0.1`（手动） | 监听地址 |
| `PORT` | `5173` | 前端端口 |
| `BACKEND_PORT` | `3000` | 后端端口 |

## 换行符说明

项目使用 `.gitattributes` 管理换行符：
- **仓库中所有文本文件**：LF（Linux/Unix 风格）
- **Windows .bat/.cmd 文件**：CRLF（保持 Windows 兼容性）
- **二进制文件**：无转换

WSL/Linux 用户无需手动处理换行符；Git 会在检出时自动应用。如果从 Windows 协作，使用 `core.autocrlf=true` 让 Git 在 Windows 上检出 CRLF、提交时转回 LF。

## 常见问题

**Q: WSL 中启动后浏览器没有打开？**
A: 检查是否有 `wslview` 或 `xdg-open` 命令；如果没有，手动访问 http://localhost:5173。

**Q: Windows 浏览器访问 localhost:5173 报错？**
A: 确保使用 `worldengine start`（设置 HOST=0.0.0.0），而不是直接 `npm run dev`。

**Q: SQLite 编译错误？**
A: WSL 需要安装构建工具：`sudo apt install build-essential`，然后重新运行 `npm install --prefix backend`。

## 回滚

如需回退到 Windows-only 模式（不推荐）：

```bash
# 撤销 .gitattributes 换行符策略
git checkout HEAD~1 -- .gitattributes

# 删除 CLI wrapper
rm -rf bin/
```

现有 `WorldEngine.bat` 启动方式保持不变。
