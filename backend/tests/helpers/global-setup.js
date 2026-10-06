/**
 * global-setup.js — node --test 的 --test-global-setup，在主进程里给本次测试运行开一个专属临时目录。
 *
 * 各测试进程经环境变量 WE_TEST_RUN_DIR 把沙箱建在这里。生产模块 db/index.js 的连接要到测试进程退出才关闭，
 * Windows 下打开中的数据库文件删不掉，所以沙箱 cleanup 删不掉时留给这里：全部测试进程退出后整目录一次删掉。
 * 每次运行一个目录，backend 与 assistant 测试同时跑时互不误删。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMP_ROOT = path.resolve(__dirname, '..', '..', '..', '.temp', 'backend-tests');

let runDir = null;

export function globalSetup() {
  fs.mkdirSync(TEMP_ROOT, { recursive: true });
  runDir = fs.mkdtempSync(path.join(TEMP_ROOT, `run-${process.pid}-`));
  process.env.WE_TEST_RUN_DIR = runDir;
}

export function globalTeardown() {
  if (runDir) fs.rmSync(runDir, { recursive: true, force: true, maxRetries: 5 });
}
