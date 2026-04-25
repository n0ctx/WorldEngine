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
    const platform = process.platform;
    if (platform === 'win32') {
      return path.join(process.resourcesPath, 'node', 'node.exe');
    }
    return path.join(process.resourcesPath, 'node', 'bin', 'node');
  }
  return 'node';
}

// ── 状态 ──────────────────────────────────────────
let backendProcess = null;
let mainWindow = null;

// ── 后端启动 ──────────────────────────────────────
async function startBackend() {
  const dataDir = app.getPath('userData');
  fs.mkdirSync(dataDir, { recursive: true });

  const nodePath = getNodePath();
  console.log('[Desktop] 项目根目录:', projectRoot);
  console.log('[Desktop] 数据目录:', dataDir);
  console.log('[Desktop] Node 路径:', nodePath);
  console.log('[Desktop] 后端入口:', backendEntry);

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

  let backendPort = null;
  const portPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('后端在 30 秒内未报告就绪端口'));
    }, 30000);

    const onData = (data) => {
      const text = data.toString();
      const match = text.match(/SERVER_READY:(\d+)/);
      if (match) {
        backendPort = parseInt(match[1], 10);
        clearTimeout(timeout);
        backendProcess.stdout.off('data', onData);
        resolve(backendPort);
      }
    };

    backendProcess.stdout.on('data', onData);

    backendProcess.on('exit', (code) => {
      if (!backendPort) {
        clearTimeout(timeout);
        reject(new Error(`后端进程异常退出，code: ${code}`));
      }
    });
  });

  backendProcess.stdout.on('data', (data) => {
    const line = data.toString().trim();
    if (line && !line.includes('SERVER_READY:')) {
      console.log(`[Backend] ${line}`);
    }
  });

  backendProcess.stderr.on('data', (data) => {
    const line = data.toString().trim();
    if (line) console.error(`[Backend] ${line}`);
  });

  backendProcess.on('exit', (code) => {
    console.log(`[Backend] 进程退出，code: ${code}`);
    backendProcess = null;
  });

  const port = await portPromise;
  console.log(`[Desktop] 后端就绪 → http://${BACKEND_HOST}:${port}`);

  // 额外等待端口真正可连接（防止 race condition）
  await waitForPort(port, 5000);
  return port;
}

// ── 窗口创建 ──────────────────────────────────────
function createWindow(port) {
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
    },
  });

  const startUrl = `http://${BACKEND_HOST}:${port}`;
  console.log('[Desktop] 加载页面:', startUrl);
  mainWindow.loadURL(startUrl);

  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ── 应用生命周期 ──────────────────────────────────
app.whenReady().then(async () => {
  try {
    const port = await startBackend();
    createWindow(port);
  } catch (err) {
    console.error('[Desktop] 启动失败:', err);
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (backendProcess) {
    console.log('[Desktop] 终止后端进程...');
    backendProcess.kill();
    backendProcess = null;
  }
});
