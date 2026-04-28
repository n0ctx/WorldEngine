import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { freshImport } from '../helpers/test-env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const TEMP_ROOT = path.join(REPO_ROOT, '.temp', 'logger-tests');

const ORIGINAL_ENV = {
  WE_DATA_DIR: process.env.WE_DATA_DIR,
  WE_CONFIG_PATH: process.env.WE_CONFIG_PATH,
  LOG_LEVEL: process.env.LOG_LEVEL,
  LOG_FILE_LEVEL: process.env.LOG_FILE_LEVEL,
  LOG_FILE: process.env.LOG_FILE,
};

afterEach(() => {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function makeLoggerRoot(name, config = {}) {
  fs.mkdirSync(TEMP_ROOT, { recursive: true });
  const root = fs.mkdtempSync(path.join(TEMP_ROOT, `${name}-`));
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'config.json'), JSON.stringify({
    logging: {
      mode: 'metadata',
      max_preview_chars: 600,
      modules: {},
      prompt: { enabled: false },
      llm_raw: { enabled: false },
      ...config,
    },
  }, null, 2));
  return root;
}

async function waitForFlush() {
  await new Promise((resolve) => setTimeout(resolve, 20));
}

test('文件日志不被终端 LOG_LEVEL 过滤掉', async () => {
  const root = makeLoggerRoot('file-level');
  process.env.WE_DATA_DIR = root;
  process.env.LOG_LEVEL = 'error';
  process.env.LOG_FILE_LEVEL = 'info';
  process.env.LOG_FILE = 'true';

  const { createLogger } = await freshImport('backend/utils/logger.js');
  createLogger('test').info('info-for-file-only');
  await waitForFlush();

  const [logFile] = fs.readdirSync(path.join(root, 'logs'));
  const content = fs.readFileSync(path.join(root, 'logs', logFile), 'utf-8');
  assert.match(content, /INFO\s+\[test\s+\].*info-for-file-only/);
});

test('文件日志仍遵守 LOG_FILE_LEVEL', async () => {
  const root = makeLoggerRoot('file-filter');
  process.env.WE_DATA_DIR = root;
  process.env.LOG_LEVEL = 'error';
  process.env.LOG_FILE_LEVEL = 'warn';
  process.env.LOG_FILE = 'true';

  const { createLogger } = await freshImport('backend/utils/logger.js');
  const log = createLogger('test');
  log.info('should-not-write');
  log.warn('should-write');
  await waitForFlush();

  const [logFile] = fs.readdirSync(path.join(root, 'logs'));
  const content = fs.readFileSync(path.join(root, 'logs', logFile), 'utf-8');
  assert.doesNotMatch(content, /should-not-write/);
  assert.match(content, /should-write/);
});

test('logger 读取 WE_CONFIG_PATH 中的 logging 配置', async () => {
  const root = makeLoggerRoot('config-path');
  const configPath = path.join(root, 'custom-config.json');
  fs.writeFileSync(configPath, JSON.stringify({
    logging: {
      mode: 'raw',
      max_preview_chars: 240,
      modules: {},
      prompt: { enabled: true },
      llm_raw: { enabled: true },
    },
  }, null, 2));

  process.env.WE_DATA_DIR = root;
  process.env.WE_CONFIG_PATH = configPath;

  const { getLoggingConfig, shouldLogRaw } = await freshImport('backend/utils/logger.js');
  const config = getLoggingConfig();
  assert.equal(config.mode, 'raw');
  assert.equal(config.max_preview_chars, 240);
  assert.equal(shouldLogRaw('prompt'), true);
  assert.equal(shouldLogRaw('llm_raw'), true);
});
