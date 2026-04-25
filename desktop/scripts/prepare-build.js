#!/usr/bin/env node
/**
 * 打包准备脚本：按目标平台/架构下载 Node.js 运行时
 *
 * Electron 的 Node.js ABI 与系统 Node.js 不同，无法直接运行编译了原生模块的后端。
 * 因此我们在打包时附带独立的 Node.js 运行时，并按平台/架构分别存放。
 */

import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { createWriteStream } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import extract from 'extract-zip';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 与系统 Node.js 保持一致，避免 better-sqlite3 等原生模块重新编译
const NODE_VERSION = '25.9.0';
const NODE_RUNTIME_DIR = path.resolve(__dirname, '..', 'node-runtime');
const TARGETS = [
  { platform: 'darwin', arch: 'x64' },
  { platform: 'darwin', arch: 'arm64' },
  { platform: 'win32', arch: 'x64' },
];
const LEGACY_RUNTIME_ENTRIES = [
  '.DS_Store',
  'CHANGELOG.md',
  'LICENSE',
  'README.md',
  'bin',
  'include',
  'lib',
  'share',
];

function getDownloadUrl(platform, arch) {
  const platformMap = {
    darwin: 'darwin',
    win32: 'win',
    linux: 'linux',
  };

  const archMap = {
    x64: 'x64',
    arm64: 'arm64',
  };

  const mappedPlatform = platformMap[platform];
  const mappedArch = archMap[arch];

  if (!mappedPlatform || !mappedArch) {
    throw new Error(`不支持的平台: ${platform} ${arch}`);
  }

  const ext = platform === 'win32' ? 'zip' : 'tar.gz';
  const filename = `node-v${NODE_VERSION}-${mappedPlatform}-${mappedArch}.${ext}`;
  const url = `https://nodejs.org/dist/v${NODE_VERSION}/${filename}`;

  return { url, filename, ext };
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    console.log(`下载: ${url}`);

    const cleanup = (err) => {
      file.close(() => {
        if (fs.existsSync(dest)) {
          fs.rmSync(dest, { force: true });
        }
        reject(err);
      });
    };

    https.get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        const redirectUrl = res.headers.location;
        console.log(`重定向到: ${redirectUrl}`);
        https.get(redirectUrl, (res2) => {
          if (res2.statusCode !== 200) {
            cleanup(new Error(`下载失败: HTTP ${res2.statusCode}`));
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
          res2.on('error', cleanup);
          file.on('error', cleanup);
          res2.pipe(file);
          file.on('finish', () => {
            file.close();
            process.stdout.write('\n');
            resolve();
          });
        }).on('error', cleanup);
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
        res.on('error', cleanup);
        file.on('error', cleanup);
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          process.stdout.write('\n');
          resolve();
        });
      } else {
        cleanup(new Error(`下载失败: HTTP ${res.statusCode}`));
      }
    }).on('error', cleanup);
  });
}

function getNodeExecutablePath(runtimeDir, platform) {
  return platform === 'win32'
    ? path.join(runtimeDir, 'node.exe')
    : path.join(runtimeDir, 'bin', 'node');
}

function flattenExtractedDir(runtimeDir) {
  const extractedDir = fs.readdirSync(runtimeDir).find((entry) => entry.startsWith('node-v'));
  if (!extractedDir) {
    return;
  }

  const src = path.join(runtimeDir, extractedDir);
  for (const item of fs.readdirSync(src)) {
    fs.renameSync(path.join(src, item), path.join(runtimeDir, item));
  }
  fs.rmSync(src, { recursive: true, force: true });
}

async function prepareRuntime(target) {
  const runtimeKey = `${target.platform}-${target.arch}`;
  const runtimeDir = path.join(NODE_RUNTIME_DIR, runtimeKey);
  const nodeExe = getNodeExecutablePath(runtimeDir, target.platform);

  if (fs.existsSync(nodeExe)) {
    console.log(`Node.js 运行时已就绪: ${runtimeKey}`);
    return;
  }

  fs.rmSync(runtimeDir, { recursive: true, force: true });
  fs.mkdirSync(runtimeDir, { recursive: true });

  const { url, filename, ext } = getDownloadUrl(target.platform, target.arch);
  const archivePath = path.join(runtimeDir, filename);

  await downloadFile(url, archivePath);

  console.log(`解压中: ${runtimeKey}`);
  if (ext === 'zip') {
    await extract(archivePath, { dir: runtimeDir });
    flattenExtractedDir(runtimeDir);
  } else {
    execSync(`tar -xzf "${archivePath}" -C "${runtimeDir}" --strip-components=1`);
  }

  fs.rmSync(archivePath, { force: true });

  if (!fs.existsSync(nodeExe)) {
    throw new Error(`运行时解压完成但未找到 node 可执行文件: ${runtimeKey}`);
  }

  console.log(`Node.js 运行时准备完成: ${runtimeKey}`);
}

async function main() {
  fs.mkdirSync(NODE_RUNTIME_DIR, { recursive: true });

  // 清理旧版单 runtime 平铺结构，避免被 extraResources 一起打进包内。
  for (const entry of LEGACY_RUNTIME_ENTRIES) {
    fs.rmSync(path.join(NODE_RUNTIME_DIR, entry), { recursive: true, force: true });
  }

  for (const target of TARGETS) {
    await prepareRuntime(target);
  }
}

main().catch((err) => {
  console.error('准备构建失败:', err.message);
  process.exit(1);
});
