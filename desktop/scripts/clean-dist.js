#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '..', 'dist');

fs.rmSync(distDir, {
  recursive: true,
  force: true,
  maxRetries: 5,
  retryDelay: 200,
});
console.log(`已清理构建输出目录: ${distDir}`);
