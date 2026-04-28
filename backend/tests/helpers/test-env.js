import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';

import { initSchema } from '../../db/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const TEMP_ROOT = path.join(REPO_ROOT, '.temp', 'backend-tests');

function mergeDeep(target, source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return source ?? target;
  }
  const result = { ...target };
  for (const [key, value] of Object.entries(source)) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      target?.[key] &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key])
    ) {
      result[key] = mergeDeep(target[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function createTestConfig(patch = {}) {
  return mergeDeep({
    version: 1,
    proxy_url: '',
    llm: {
      provider: 'mock',
      provider_keys: {},
      provider_models: {},
      base_url: '',
      model: 'mock-model',
      max_tokens: 256,
      temperature: 0.6,
      thinking_level: null,
    },
    embedding: {
      provider: null,
      provider_keys: {},
      provider_models: {},
      base_url: '',
      model: '',
    },
    ui: {
      theme: 'dark',
      font_size: 16,
      custom_css: '',
      show_thinking: true,
      auto_collapse_thinking: true,
    },
    context_history_rounds: 3,
    global_system_prompt: '',
    global_post_prompt: '',
    memory_expansion_enabled: false,
    suggestion_enabled: false,
    log_prompt: false,
    logging: {
      mode: 'metadata',
      max_preview_chars: 600,
      modules: {},
      prompt: { enabled: false },
      llm_raw: { enabled: false },
    },
    writing: {
      global_system_prompt: '',
      global_post_prompt: '',
      context_history_rounds: null,
      suggestion_enabled: false,
      memory_expansion_enabled: false,
      llm: {
        model: '',
        temperature: null,
        max_tokens: null,
      },
    },
  }, patch);
}

export function createTestSandbox(name, configPatch = {}) {
  const root = path.join(TEMP_ROOT, `${name}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`);
  const dbPath = path.join(root, 'worldengine.test.db');
  const configPath = path.join(root, 'config.json');
  const uploadsDir = path.join(root, 'uploads');
  const vectorsDir = path.join(root, 'vectors');
  const turnSummaryStorePath = path.join(vectorsDir, 'turn_summaries.json');

  fs.mkdirSync(uploadsDir, { recursive: true });
  fs.mkdirSync(vectorsDir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(createTestConfig(configPatch), null, 2));

  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  initSchema(db);

  return {
    root,
    dbPath,
    configPath,
    uploadsDir,
    vectorsDir,
    turnSummaryStorePath,
    db,
    setEnv() {
      process.env.WE_DB_PATH = dbPath;
      process.env.WE_CONFIG_PATH = configPath;
      process.env.WE_DATA_DIR = root;
      process.env.WE_UPLOADS_DIR = uploadsDir;
      process.env.WE_TURN_SUMMARY_STORE_PATH = turnSummaryStorePath;
      process.env.WE_DISABLE_AUTOSTART = 'true';
      process.env.WE_LLM_RETRY_MAX = '0';
      process.env.WE_LLM_RETRY_DELAY_MS = '0';
      process.env.LOG_FILE = 'false';
    },
    writeConfig(nextConfig) {
      fs.writeFileSync(configPath, JSON.stringify(nextConfig, null, 2));
    },
    readConfig() {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    },
    cleanup() {
      try {
        db.close();
      } catch {
        // ignore
      }
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

export function resetMockEnv() {
  for (const key of [
    'MOCK_LLM_RESPONSE',
    'MOCK_LLM_COMPLETE',
    'MOCK_LLM_STREAM',
    'MOCK_LLM_COMPLETE_QUEUE',
    'MOCK_LLM_STREAM_QUEUE',
    'MOCK_LLM_STREAM_CHUNKS',
    'MOCK_LLM_STREAM_DELAYS',
    'MOCK_LLM_COMPLETE_ERROR',
    'MOCK_LLM_STREAM_ERROR',
    'MOCK_LLM_ERROR_STATUS',
    'MOCK_LLM_TOOL_CALLS',
  ]) {
    delete process.env[key];
  }
}

/**
 * 加载项目内模块，使用稳定 URL 以便 V8 native coverage 能正确归并行覆盖。
 *
 * 历史背景：早期实现给 URL 追加 `?t=...` query 强制每次拿到新模块实例，但这会让
 * V8 把每次 reimport 视作不同 script，导致 `--experimental-test-coverage` 的报告
 * 严重低估实际覆盖率（被测函数虽然执行了，但记到了一个临时 URL 上，原文件路径
 * 显示为 0）。改成稳定 URL 后，多次调用 freshImport 返回同一个模块实例。
 *
 * 如果某个测试真的需要"重新加载模块以读取改动后的 process.env / 配置文件 mtime"，
 * 改用 `freshImportUncached(...)` —— 但要承担覆盖率不计入的代价。优先用以下手段：
 *   - 在模块层暴露 reset/refresh 函数（如 logger 的 mtime cache 已自动失效）
 *   - 在测试初始化阶段一次性设置好 env，再加载模块
 */
export async function freshImport(relativePath) {
  const absPath = path.resolve(REPO_ROOT, relativePath);
  return import(pathToFileURL(absPath).href);
}

/**
 * 强制重新加载模块（绕过 ESM 缓存）。会导致 V8 coverage 不计入该模块的行覆盖率，
 * 仅在测试必须读取模块加载时捕获的常量（例如顶层 `path.resolve(env)`）时使用。
 */
export async function freshImportUncached(relativePath) {
  const absPath = path.resolve(REPO_ROOT, relativePath);
  return import(`${pathToFileURL(absPath).href}?t=${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

export function writeUploadFile(sandbox, relativePath, content) {
  const absPath = path.join(sandbox.uploadsDir, relativePath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, content);
  return absPath;
}
