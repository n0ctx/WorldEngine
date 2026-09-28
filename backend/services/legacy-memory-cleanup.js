/**
 * legacy-memory-cleanup.js — 启动时清理旧版记忆数据目录
 *
 * 记忆系统重构后 data/vectors/ 与 data/long_term_memory/ 不再使用，
 * server.js 启动阶段调用一次 removeLegacyMemoryData() 清空残留数据。
 */

import fs from 'node:fs';
import path from 'node:path';

import { DATA_ROOT } from '../utils/data-dir.js';
import { createLogger, formatMeta } from '../utils/logger.js';

const log = createLogger('legacy-cleanup');

const LEGACY_DIRS = ['vectors', 'long_term_memory'];

export function removeLegacyMemoryData() {
  for (const name of LEGACY_DIRS) {
    const dir = path.join(DATA_ROOT, name);
    if (!fs.existsSync(dir)) continue;
    fs.rmSync(dir, { recursive: true, force: true });
    log.info(`REMOVED  ${formatMeta({ dir: name })}`);
  }
}
