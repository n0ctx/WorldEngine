import net from 'node:net';
import path from 'node:path';

/**
 * 轮询检测某个 TCP 端口是否就绪
 * @param {number} port
 * @param {number} timeoutMs  最大等待毫秒
 * @returns {Promise<void>}
 */
export function waitForPort(port, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    function tryConnect() {
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`端口 ${port} 在 ${timeoutMs}ms 内未就绪`));
        return;
      }

      const socket = new net.Socket();
      socket.setTimeout(1000);

      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });

      socket.once('error', () => {
        socket.destroy();
        setTimeout(tryConnect, 500);
      });

      socket.once('timeout', () => {
        socket.destroy();
        setTimeout(tryConnect, 500);
      });

      socket.connect(port, '127.0.0.1');
    }

    tryConnect();
  });
}

/**
 * 根据当前运行环境（开发 / asar 打包）返回项目根目录
 * @param {string} __dirname  当前文件所在目录
 * @param {boolean} isPackaged  是否已打包
 * @returns {string}
 */
export function getProjectRoot(__dirname, isPackaged) {
  if (isPackaged) {
    // asar 打包后，process.resourcesPath 指向 app.asar 同级目录
    return process.resourcesPath;
  }
  // 开发模式：desktop/ 的上级就是项目根目录
  return path.resolve(__dirname, '..', '..');
}
