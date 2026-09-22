#!/usr/bin/env node
// 启动 dev 前释放被占用的端口（跨平台）：Windows 走 netstat + taskkill，其余走 lsof + kill。
// 任何失败都静默忽略，永远以 0 退出，不阻塞 dev 启动。
import { execSync } from 'node:child_process';

const port = Number(process.argv[2]);
if (!Number.isInteger(port)) process.exit(0);

function run(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return '';
  }
}

const pids = new Set();
if (process.platform === 'win32') {
  // 不加 -p：-p tcp 只列 IPv4，会漏掉 vite 默认监听的 [::1]
  for (const line of run('netstat -ano').split(/\r?\n/)) {
    const cols = line.trim().split(/\s+/);
    // 协议  本地地址  外部地址  状态  PID
    if (cols.length === 5 && cols[0] === 'TCP' && cols[1].endsWith(`:${port}`) && cols[3] === 'LISTENING') pids.add(cols[4]);
  }
} else {
  for (const pid of run(`lsof -ti tcp:${port}`).split(/\s+/)) if (pid) pids.add(pid);
}

for (const pid of pids) {
  if (pid === '0' || pid === String(process.pid)) continue;
  run(process.platform === 'win32' ? `taskkill /F /PID ${pid}` : `kill -9 ${pid}`);
}
