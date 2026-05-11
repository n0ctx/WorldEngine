// assistant/server/state-store.js
//
// 写卡助手旧版 JSON sidecar 兼容层。
// 当前权威持久化已迁到 SQLite `assistant_tasks` 表；本文件只负责读取/删除
// 旧 <ASSISTANT_STATE_DIR>/<taskId>.json，用于启动时一次性导入与测试隔离。
//
// 设计:
// - 同步 API:写入频次低(每次用户消息/状态切换/单条 message append),
//   同步 fs 调用对延迟无感知;反而避免并发写竞态。
// - 校验 taskId:只允许 ^task-[a-zA-Z0-9]+$,防止 ../ 穿越目录。
// - 默认目录:.temp/assistant/(与 plan-doc 同目录)。

import fs from 'node:fs';
import path from 'node:path';

const TASK_ID_RE = /^task-[a-zA-Z0-9]+$/;

function resolveDir() {
  const base = process.env.ASSISTANT_STATE_DIR
    ?? path.resolve(process.cwd(), '.temp/assistant');
  fs.mkdirSync(base, { recursive: true });
  return base;
}

function assertId(taskId) {
  if (typeof taskId !== 'string' || !TASK_ID_RE.test(taskId)) {
    throw new Error(`invalid taskId: ${taskId}`);
  }
}

export function writeTaskFile(taskId, payload) {
  assertId(taskId);
  const dir = resolveDir();
  const target = path.join(dir, `${taskId}.json`);
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(payload));
  fs.renameSync(tmp, target);
}

export function deleteTaskFile(taskId) {
  assertId(taskId);
  const dir = resolveDir();
  const target = path.join(dir, `${taskId}.json`);
  try { fs.unlinkSync(target); } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

export function readAllTasks() {
  const dir = resolveDir();
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith('.json')) continue;
    const full = path.join(dir, e.name);
    try {
      const raw = fs.readFileSync(full, 'utf8');
      out.push(JSON.parse(raw));
    } catch { /* 损坏文件跳过,不阻塞启动 */ }
  }
  return out;
}
