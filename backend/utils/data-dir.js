/**
 * data-dir.js — 运行时数据目录
 *
 * DATA_ROOT 取环境变量 WE_DATA_DIR（桌面端 / 测试沙箱设置），未设置时为仓库根下的 data/。
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const DATA_ROOT = process.env.WE_DATA_DIR
  ? path.resolve(process.env.WE_DATA_DIR)
  : path.resolve(__dirname, '..', '..', 'data');

export const UPLOADS_DIR = path.join(DATA_ROOT, 'uploads');
