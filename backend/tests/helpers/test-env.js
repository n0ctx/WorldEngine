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
    'MOCK_LLM_COMPLETE_ERROR',
    'MOCK_LLM_STREAM_ERROR',
    'MOCK_LLM_ERROR_STATUS',
    'MOCK_LLM_TOOL_CALLS',
  ]) {
    delete process.env[key];
  }
}

export async function freshImport(relativePath) {
  const absPath = path.resolve(REPO_ROOT, relativePath);
  return import(`${pathToFileURL(absPath).href}?t=${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

export function writeUploadFile(sandbox, relativePath, content) {
  const absPath = path.join(sandbox.uploadsDir, relativePath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, content);
  return absPath;
}
