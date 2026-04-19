/**
 * logger.js — 分级带色彩终端日志 + 按日文件写入 + 配置驱动 preview
 *
 * 环境变量：
 *   LOG_LEVEL=debug|info|warn|error       终端最低输出级别（默认 warn）
 *   LOG_FILE=false                         关闭文件写入（默认开启）
 *   LOG_FILE_LEVEL=debug|info|warn|error  文件最低写入级别（默认 info）
 *
 * 配置文件 data/config.json：
 *   logging.mode = "metadata" | "raw"
 *   logging.max_preview_chars = 600
 *   logging.prompt.enabled = false
 *   logging.llm_raw.enabled = false
 *
 * 用法：
 *   import { createLogger, formatMeta, previewText } from '../utils/logger.js';
 *   const log = createLogger('llm', 'cyan');
 *   log.info(`request ${formatMeta({ provider: 'openai', msgs: 12 })}`);
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '..', '..', 'data');
const LOGS_DIR = path.join(DATA_DIR, 'logs');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');

const LEVEL_ORDER = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = LEVEL_ORDER[process.env.LOG_LEVEL?.toLowerCase()] ?? LEVEL_ORDER.warn;
const fileLogLevel = LEVEL_ORDER[process.env.LOG_FILE_LEVEL?.toLowerCase()] ?? LEVEL_ORDER.info;
const FILE_LOG_ENABLED = process.env.LOG_FILE !== 'false';

const C = {
  debug: '\x1b[90m',
  info: '\x1b[36m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  magenta: '\x1b[35m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  white: '\x1b[37m',
};

const LEVEL_ICON = { debug: '·', info: '◆', warn: '▲', error: '✖' };
const ANSI_RE = /\x1b\[[0-9;]*m/g;
const stripAnsi = (s) => s.replace(ANSI_RE, '');

const DEFAULT_LOGGING_CONFIG = {
  mode: 'metadata',
  max_preview_chars: 600,
  modules: {},
  prompt: { enabled: false },
  llm_raw: { enabled: false },
};

let _pendingLines = [];
let _flushScheduled = false;
let _lastDate = '';
let _logFile = '';
let _loggingCache = null;
let _loggingCacheMtimeMs = -1;

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function currentLogFile() {
  const today = todayStr();
  if (today !== _lastDate) {
    _lastDate = today;
    _logFile = path.join(LOGS_DIR, `worldengine-${today}.log`);
    try {
      fs.mkdirSync(LOGS_DIR, { recursive: true });
    } catch {
      /* ignore */
    }
  }
  return _logFile;
}

function flushToFile() {
  _flushScheduled = false;
  if (_pendingLines.length === 0) return;
  const lines = _pendingLines.splice(0);
  try {
    fs.appendFileSync(currentLogFile(), lines.join('\n') + '\n');
  } catch {
    /* ignore */
  }
}

function writeToFile(plainLine, level) {
  if (!FILE_LOG_ENABLED || LEVEL_ORDER[level] < fileLogLevel) return;
  _pendingLines.push(plainLine);
  if (!_flushScheduled) {
    _flushScheduled = true;
    setImmediate(flushToFile);
  }
}

function timestamp() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

function normalizeLoggingConfig(raw) {
  const logging = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const promptEnabled = logging.prompt?.enabled ?? raw?.log_prompt ?? DEFAULT_LOGGING_CONFIG.prompt.enabled;
  return {
    ...DEFAULT_LOGGING_CONFIG,
    ...logging,
    mode: logging.mode === 'raw' ? 'raw' : 'metadata',
    max_preview_chars: Number.isFinite(Number(logging.max_preview_chars))
      ? Math.max(120, Math.floor(Number(logging.max_preview_chars)))
      : DEFAULT_LOGGING_CONFIG.max_preview_chars,
    modules: logging.modules && typeof logging.modules === 'object' && !Array.isArray(logging.modules)
      ? { ...logging.modules }
      : {},
    prompt: {
      ...DEFAULT_LOGGING_CONFIG.prompt,
      ...(logging.prompt && typeof logging.prompt === 'object' ? logging.prompt : {}),
      enabled: !!promptEnabled,
    },
    llm_raw: {
      ...DEFAULT_LOGGING_CONFIG.llm_raw,
      ...(logging.llm_raw && typeof logging.llm_raw === 'object' ? logging.llm_raw : {}),
      enabled: !!logging.llm_raw?.enabled,
    },
  };
}

export function getLoggingConfig() {
  try {
    const stat = fs.statSync(CONFIG_PATH);
    if (_loggingCache && _loggingCacheMtimeMs === stat.mtimeMs) return _loggingCache;
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    _loggingCache = normalizeLoggingConfig(raw.logging ? { ...raw.logging, log_prompt: raw.log_prompt } : raw);
    _loggingCacheMtimeMs = stat.mtimeMs;
    return _loggingCache;
  } catch {
    return structuredClone(DEFAULT_LOGGING_CONFIG);
  }
}

export function getLogMode() {
  return getLoggingConfig().mode;
}

export function shouldLogRaw(kind = 'default') {
  const config = getLoggingConfig();
  if (config.mode !== 'raw') return false;
  if (kind === 'prompt') return !!config.prompt?.enabled;
  if (kind === 'llm_raw') return !!config.llm_raw?.enabled;
  return true;
}

export function previewText(value, options = {}) {
  if (value == null) return '';
  const config = getLoggingConfig();
  const limit = Number.isFinite(options.limit) ? options.limit : config.max_preview_chars;
  const text = String(value).replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length <= limit) return text;
  const head = Math.max(40, Math.floor(limit * 0.7));
  const tail = Math.max(20, limit - head - 9);
  return `${text.slice(0, head)} ...SNIP... ${text.slice(-tail)}`;
}

export function previewJson(value, options = {}) {
  if (value == null) return '';
  try {
    return previewText(typeof value === 'string' ? value : JSON.stringify(value), options);
  } catch {
    return previewText(String(value), options);
  }
}

export function summarizeMessages(messages = []) {
  const roles = {};
  let chars = 0;
  for (const msg of messages) {
    const role = msg?.role || 'unknown';
    roles[role] = (roles[role] || 0) + 1;
    if (typeof msg?.content === 'string') {
      chars += msg.content.length;
    } else if (Array.isArray(msg?.content)) {
      for (const part of msg.content) {
        if (part?.type === 'text') chars += String(part.text ?? '').length;
      }
    }
  }
  return { count: messages.length, chars, roles };
}

export function formatMeta(meta = {}) {
  return Object.entries(meta)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => {
      if (value === null) return `${key}=null`;
      if (typeof value === 'string') return `${key}=${JSON.stringify(value)}`;
      if (Array.isArray(value)) return `${key}=${JSON.stringify(value)}`;
      if (typeof value === 'object') return `${key}=${previewJson(value)}`;
      return `${key}=${String(value)}`;
    })
    .join('  ');
}

function formatArg(a) {
  if (typeof a === 'string') return a;
  if (a instanceof Error) return `${a.name}: ${a.message}`;
  try {
    return JSON.stringify(a);
  } catch {
    return String(a);
  }
}

function write(level, tag, tagColor, args) {
  if (LEVEL_ORDER[level] < currentLevel) return;

  const lc = C[level];
  const tc = C[tagColor] ?? C.bold;
  const icon = LEVEL_ICON[level];
  const ts = `${C.dim}${timestamp()}${C.reset}`;
  const lvl = `${lc}${level.toUpperCase().padEnd(5)}${C.reset}`;
  const tagPad = (tag ?? '').padEnd(8);
  const tagStr = `${tc}[${tagPad}]${C.reset}`;
  const msg = args.map(formatArg).join(' ');

  const colorLine = `${ts} ${lvl} ${tagStr} ${lc}${icon}${C.reset} ${msg}`;
  const plainLine = `${timestamp()} ${level.toUpperCase().padEnd(5)} [${tagPad}] ${icon} ${msg}`;

  if (level === 'error') console.error(colorLine);
  else if (level === 'warn') console.warn(colorLine);
  else console.log(colorLine);

  writeToFile(stripAnsi(plainLine), level);
}

export function createLogger(tag, color = 'bold') {
  return {
    debug: (...args) => write('debug', tag, color, args),
    info: (...args) => write('info', tag, color, args),
    warn: (...args) => write('warn', tag, color, args),
    error: (...args) => write('error', tag, color, args),
  };
}

export function logPrompt(sessionId, messages) {
  const summary = summarizeMessages(messages);
  const sid = sessionId ? sessionId.slice(0, 8) : '?';
  const config = getLoggingConfig();
  const logger = createLogger('prompt', 'magenta');
  logger.debug(`PROMPT  ${formatMeta({ session: sid, msgs: summary.count, chars: summary.chars, roles: summary.roles, mode: config.mode })}`);

  if (!config.prompt?.enabled) return;

  if (config.mode !== 'raw') {
    logger.debug(`PROMPT META  ${formatMeta({ session: sid, preview: 'disabled(raw=false)' })}`);
    return;
  }

  const previews = messages.map((msg, index) => {
    const text = Array.isArray(msg.content)
      ? msg.content.find((part) => part.type === 'text')?.text ?? '[binary]'
      : msg.content ?? '';
    return `#${index}:${msg.role}:${previewText(text)}`;
  });
  logger.debug(`PROMPT RAW  ${formatMeta({ session: sid, items: previews })}`);
}
