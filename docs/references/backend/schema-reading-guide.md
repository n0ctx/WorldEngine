# Backend Schema Reading Guide

查字段、配置键、导入导出格式或存储目录时，先读本页，再跳到 `schema-and-storage.md` 对应章节。

## 快速入口

- 查 SQLite 表、字段、索引、级联删除：读 [`schema-and-storage.md`](schema-and-storage.md) 的 `## 表结构`
- 查 `data/` 目录、上传路径、向量文件、日志目录：读 `schema-and-storage.md` 的 `## 总览`
- 查 `data/config.json` 键结构：读 `schema-and-storage.md` 的 `## 全局配置文件结构`
- 查 `.wechar.json` / `.weworld.json` / `.weglobal.json`：读 `schema-and-storage.md` 的 `## 导入导出 JSON 格式`
- 查写卡助手任务持久化、`assistant_tasks`、`plan_doc_content`：读 `schema-and-storage.md` 中 `assistant_tasks` 小节

## 高频任务怎么跳

- 改世界/角色/persona/session/message 表：从 `## 表结构` 里对应实体开始
- 改状态字段或状态值：直接搜 `state_fields` / `state_values`
- 改 prompt 条目、条件、正则、CSS、nearby：直接搜对应表名
- 改导入导出版本或格式：先看 `backend/services/import-export-constants.js`，再对照 `## 导入导出 JSON 格式`

## 不在这里查什么

- SSE 事件、接口阶段顺序：去 [`routes-and-sse.md`](routes-and-sse.md)
- prompt 组装顺序、provider 行为：去 [`prompts-and-llm.md`](prompts-and-llm.md)
- 异步队列与删除钩子：去 [`async-jobs-and-hooks.md`](async-jobs-and-hooks.md)
