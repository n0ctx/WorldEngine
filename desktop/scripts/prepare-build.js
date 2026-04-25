#!/usr/bin/env node
/**
 * 打包准备脚本：下载对应平台的 Node.js 可执行文件
 *
 * Electron 的 Node.js ABI 与系统 Node.js 不同，无法直接运行编译了原生模块的后端。
 * 因此我们在打包时附带一个独立的 Node.js 运行时，用它来启动后端服务。
 */

import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { createWriteStream } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 与系统 Node.js 保持一致，避免 better-sqlite3 等原生模块重新编译
const NODE_VERSION = '25.9.0';
const NODE_RUNTIME_DIR = path.resolve(__dirname, '..', 'node-runtime');

function getDownloadUrl() {
  const platform = process.platform;
  const arch = process.arch;

  const platformMap = {
    darwin: 'darwin',
    win32: 'win',
    linux: 'linux',
  };

  const archMap = {
    x64: 'x64',
    arm64: 'arm64',
  };

  const p = platformMap[platform];
  const a = archMap[arch];

  if (!p || !a) {
    throw new Error(`不支持的平台: ${platform} ${arch}`);
  }

  const ext = platform === 'win32' ? 'zip' : 'tar.gz';
  const filename = `node-v${NODE_VERSION}-${p}-${a}.${ext}`;
  const url = `https://nodejs.org/dist/v${NODE_VERSION}/${filename}`;

  return { url, filename, platform };
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    console.log(`下载: ${url}`);

    https.get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        const redirectUrl = res.headers.location;
        console.log(`重定向到: ${redirectUrl}`);
        https.get(redirectUrl, (res2) => {
          if (res2.statusCode !== 200) {
            reject(new Error(`下载失败: HTTP ${res2.statusCode}`));
            return;
          }
          const total = parseInt(res2.headers['content-length'] || '0', 10);
          let downloaded = 0;
          res2.on('data', (chunk) => {
            downloaded += chunk.length;
            if (total > 0 && downloaded % (5 * 1024 * 1024) < chunk.length) {
              const pct = ((downloaded / total) * 100).toFixed(1);
              process.stdout.write(`\r进度: ${pct}%`);
            }
          });
          res2.pipe(file);
          file.on('finish', () => {
            file.close();
            process.stdout.write('\n');
            resolve();
          });
        }).on('error', reject);
      } else if (res.statusCode === 200) {
        const total = parseInt(res.headers['content-length'] || '0', 10);
        let downloaded = 0;
        res.on('data', (chunk) => {
          downloaded += chunk.length;
          if (total > 0 && downloaded % (5 * 1024 * 1024) < chunk.length) {
            const pct = ((downloaded / total) * 100).toFixed(1);
            process.stdout.write(`\r进度: ${pct}%`);
          }
        });
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          process.stdout.write('\n');
          resolve();
        });
      } else {
        reject(new Error(`下载失败: HTTP ${res.statusCode}`));
      }
    }).on('error', reject);
  });
}

async function main() {
  // 如果已经准备好，跳过
  if (fs.existsSync(NODE_RUNTIME_DIR)) {
    const nodeExe = process.platform === 'win32'
      ? path.join(NODE_RUNTIME_DIR, 'node.exe')
      : path.join(NODE_RUNTIME_DIR, 'bin', 'node');
    if (fs.existsSync(nodeExe)) {
      console.log('Node.js 运行时已就绪:', NODE_RUNTIME_DIR);
      return;
    }
  }

  fs.mkdirSync(NODE_RUNTIME_DIR, { recursive: true });

  const { url, filename, platform } = getDownloadUrl();
  const archivePath = path.join(NODE_RUNTIME_DIR, filename);

  await downloadFile(url, archivePath);

  console.log('解压中...');
  if (platform === 'win32') {
    // macOS 通常自带 unzip
    execSync(`unzip -q "${archivePath}" -d "${NODE_RUNTIME_DIR}"`);
    // 解压后目录名为 node-vX.X.X-win-x64，需要把内容移到根级
    const extractedDir = fs.readdirSync(NODE_RUNTIME_DIR).find(d => d.startsWith('node-v'));
    if (extractedDir) {
      const src = path.join(NODE_RUNTIME_DIR, extractedDir);
      for (const item of fs.readdirSync(src)) {
        fs.renameSync(path.join(src, item), path.join(NODE_RUNTIME_DIR, item));
      }
      fs.rmdirSync(src);
    }
  } else {
    // macOS / Linux: tar.gz
    execSync(`tar -xzf "${archivePath}" -C "${NODE_RUNTIME_DIR}" --strip-components=1`);
  }

  fs.unlinkSync(archivePath);
  console.log('Node.js 运行时准备完成:', NODE_RUNTIME_DIR);
}

main().catch((err) => {
  console.error('准备构建失败:', err.message);
  process.exit(1);
});
