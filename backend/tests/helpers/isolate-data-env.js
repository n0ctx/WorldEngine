/**
 * isolate-data-env.js — 测试进程预加载（node --import），在任何测试模块求值前把运行时数据目录指到临时目录。
 *
 * 数据库、配置、上传目录等路径在模块首次加载时就按环境变量定型；测试文件的静态 import
 * 往往早于沙箱的 setEnv()，此时若环境变量为空，这些模块会落到仓库真实的 data/。
 * 预加载先给出一个本进程专用的临时目录，沙箱之后照常覆盖，已定型的模块也只会碰到临时目录。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMP_ROOT = path.resolve(__dirname, '..', '..', '..', '.temp', 'backend-tests');

if (!process.env.WE_DATA_DIR) {
  fs.mkdirSync(TEMP_ROOT, { recursive: true });
  const root = fs.mkdtempSync(path.join(TEMP_ROOT, `process-${process.pid}-`));
  process.env.WE_DATA_DIR = root;
  process.env.WE_UPLOADS_DIR = path.join(root, 'uploads');
  process.on('exit', () => fs.rmSync(root, { recursive: true, force: true }));
}
