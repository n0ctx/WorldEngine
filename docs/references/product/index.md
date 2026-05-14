# Product References

产品说明、桌面打包、公开文档结构与路线图入口。

## 什么时候读

- 改 README 叙事、产品形态文档、桌面端说明、路线图

本主轴承接的高频跨模块任务片段：

- 面向用户的入口、产品说明、README 导航与公开信息架构
- 桌面端打包、运行时下载、主进程与分发体验

## 先读哪几页

1. [`overview.md`](overview.md)：产品形态、功能边界、用户可见行为
2. [`desktop-and-packaging.md`](desktop-and-packaging.md)：Electron、数据目录、打包命令
3. [`desktop-runtime.md`](desktop-runtime.md)：主进程、preload、桌面端后端启动与打包脚本
4. [`roadmap.md`](roadmap.md)：当前任务池与长期方向

## 高频任务快速分流

- 想确认产品定位、用户路径、会话类型：读 [`overview.md`](overview.md)
- 想改桌面端启动、dist、数据目录：读 [`desktop-and-packaging.md`](desktop-and-packaging.md)
- 想改 Electron 主进程、preload、runtime 下载：读 [`desktop-runtime.md`](desktop-runtime.md)
- 想更新 README 导航或路线图：读 [`roadmap.md`](roadmap.md)

## 真源与非真源

- 真源：本主轴文档、README 面向用户的公开表述
- 非真源：内部执行规范、数据库字段细节

## 何时同步

- 产品定位、打包方式、路线图结构变化时
