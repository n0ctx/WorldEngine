import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { waitForPort, getProjectRoot } from './utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── 常量 ──────────────────────────────────────────
const BACKEND_HOST = '127.0.0.1';

// ── 路径解析 ──────────────────────────────────────
const projectRoot = getProjectRoot(__dirname, app.isPackaged);
const backendEntry = path.join(projectRoot, 'backend', 'server.js');
const preloadPath = path.join(__dirname, 'preload.js');

function getNodePath() {
  if (app.isPackaged) {
    const runtimeDir = path.join(process.resourcesPath, 'node', `${process.platform}-${process.arch}`);
    if (process.platform === 'win32') {
      return path.join(runtimeDir, 'node.exe');
    }
    return path.join(runtimeDir, 'bin', 'node');
  }
  return 'node';
}

// ── 状态 ──────────────────────────────────────────
let backendProcess = null;
let mainWindow = null;
let backendPort = null;
let isShuttingDown = false;

// ── 日志 ──────────────────────────────────────────
function log(...args) {
  console.log('[Desktop]', ...args);
}
function logErr(...args) {
  console.error('[Desktop]', ...args);
}

// ── 全局错误捕获（防止主进程崩溃导致窗口白屏/消失）──
process.on('uncaughtException', (err) => {
  logErr('未捕获异常:', err);
});
process.on('unhandledRejection', (reason) => {
  logErr('未处理的 Promise 拒绝:', reason);
});

// ── 后端启动 ──────────────────────────────────────
async function startBackend() {
  const dataDir = app.getPath('userData');
  fs.mkdirSync(dataDir, { recursive: true });

  const nodePath = getNodePath();
  log('项目根目录:', projectRoot);
  log('数据目录:', dataDir);
  log('Node 路径:', nodePath);
  log('后端入口:', backendEntry);

  backendProcess = spawn(nodePath, [backendEntry], {
    cwd: projectRoot,
    env: {
      ...process.env,
      WE_SERVE_STATIC: 'true',
      WE_DATA_DIR: dataDir,
      HOST: BACKEND_HOST,
      PORT: '0', // 随机端口，避免端口冲突
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let resolvedPort = null;
  const portPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('后端在 30 秒内未报告就绪端口'));
    }, 30000);

    const onData = (data) => {
      const text = data.toString();
      const match = text.match(/SERVER_READY:(\d+)/);
      if (match) {
        resolvedPort = parseInt(match[1], 10);
        clearTimeout(timeout);
        backendProcess.stdout.off('data', onData);
        resolve(resolvedPort);
      }
    };

    backendProcess.stdout.on('data', onData);

    backendProcess.on('exit', (code) => {
      if (!resolvedPort) {
        clearTimeout(timeout);
        reject(new Error(`后端进程异常退出，code: ${code}`));
      }
    });
  });

  backendProcess.stdout.on('data', (data) => {
    const line = data.toString().trim();
    if (line && !line.includes('SERVER_READY:')) {
      log(`[Backend] ${line}`);
    }
  });

  backendProcess.stderr.on('data', (data) => {
    const line = data.toString().trim();
    if (line) logErr(`[Backend] ${line}`);
  });

  backendProcess.on('exit', (code, signal) => {
    log(`后端进程退出，code: ${code}, signal: ${signal}`);
    backendProcess = null;
    // 打包环境下后端意外退出时尝试自动重启（最多 3 次）
    if (!isShuttingDown && app.isPackaged && mainWindow && !mainWindow.isDestroyed()) {
      handleBackendCrash();
    }
  });

  const port = await portPromise;
  backendPort = port;
  backendRestartCount = 0;
  log(`后端就绪 → http://${BACKEND_HOST}:${port}`);

  // 额外等待端口真正可连接（防止 race condition）
  await waitForPort(port, 5000);
  return port;
}

// ── 后端崩溃自动恢复 ──────────────────────────────
let backendRestartCount = 0;
const MAX_BACKEND_RESTARTS = 3;

async function handleBackendCrash() {
  if (backendRestartCount >= MAX_BACKEND_RESTARTS) {
    logErr(`后端已崩溃 ${MAX_BACKEND_RESTARTS} 次，不再自动重启`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.executeJavaScript(`
        if (window.__backendCrashNotice) window.__backendCrashNotice();
      `).catch(() => {});
    }
    return;
  }
  backendRestartCount++;
  log(`后端崩溃，第 ${backendRestartCount}/${MAX_BACKEND_RESTARTS} 次尝试重启...`);
  try {
    const port = await startBackend();
    // 如果窗口还在，刷新页面到新端口
    if (mainWindow && !mainWindow.isDestroyed()) {
      const startUrl = `http://${BACKEND_HOST}:${port}`;
      log('重新加载页面:', startUrl);
      mainWindow.loadURL(startUrl);
    }
  } catch (err) {
    logErr('后端重启失败:', err);
  }
}

// ── 窗口创建 ──────────────────────────────────────
function createWindow(port) {
  const startUrl = `http://${BACKEND_HOST}:${port}`;

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: 'WorldEngine',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      // macOS 上某些 GPU 驱动可能导致渲染进程崩溃白屏，此处作为兜底
      ...(process.platform === 'darwin' ? { webgl: false } : {}),
    },
  });

  log('加载页面:', startUrl);
  mainWindow.loadURL(startUrl);

  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }

  // ── 渲染进程崩溃/消失检测 ───────────────────────
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    logErr('渲染进程异常退出:', details.reason, details.exitCode);
    // 尝试重载页面恢复
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.reload();
    }
  });

  mainWindow.webContents.on('crashed', () => {
    logErr('渲染进程崩溃');
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.reload();
    }
  });

  // 页面加载失败时重试
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    logErr('页面加载失败:', errorCode, errorDescription);
    if (!mainWindow.isDestroyed()) {
      setTimeout(() => mainWindow.webContents.reload(), 2000);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

// ── 应用生命周期 ──────────────────────────────────
app.whenReady().then(async () => {
  try {
    const port = await startBackend();
    createWindow(port);
  } catch (err) {
    logErr('启动失败:', err);
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      // 修复：必须传入当前已知的 backendPort，否则加载 undefined 端口导致白屏
      if (backendPort) {
        createWindow(backendPort);
      } else {
        logErr('activate 事件触发但后端端口未知，尝试重新启动后端');
        startBackend().then(createWindow).catch((err) => {
          logErr('重新启动后端失败:', err);
        });
      }
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  isShuttingDown = true;
  if (backendProcess) {
    log('终止后端进程...');
    backendProcess.kill();
    backendProcess = null;
  }
});
