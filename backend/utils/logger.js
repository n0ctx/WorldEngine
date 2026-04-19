/**
 * logger.js — 分级带色彩终端日志 + 按日文件写入
 *
 * 环境变量：
 *   LOG_LEVEL=debug|info|warn|error       终端最低输出级别（默认 warn）
 *   LOG_FILE=false                         关闭文件写入（默认开启）
 *   LOG_FILE_LEVEL=debug|info|warn|error  文件最低写入级别（默认 info）
 *
 * 用法：
 *   import { createLogger } from '../utils/logger.js';
 *   const log = createLogger('llm');             // 默认 bold tag
 *   const log = createLogger('http', 'cyan');    // 指定 tag 颜色
 *   log.debug('message');
 *   log.info('key=value  key2=value2');
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ─── 路径 ──────────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGS_DIR  = path.resolve(__dirname, '..', '..', 'data', 'logs');

// ─── 级别配置 ──────────────────────────────────────────────────────
const LEVEL_ORDER = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel   = LEVEL_ORDER[process.env.LOG_LEVEL?.toLowerCase()]       ?? LEVEL_ORDER.warn;
const fileLogLevel   = LEVEL_ORDER[process.env.LOG_FILE_LEVEL?.toLowerCase()]  ?? LEVEL_ORDER.info;
const FILE_LOG_ENABLED = process.env.LOG_FILE !== 'false';

// ─── ANSI 颜色 ─────────────────────────────────────────────────────
const C = {
  debug:   '\x1b[90m',   // 灰色
  info:    '\x1b[36m',   // 青色
  warn:    '\x1b[33m',   // 黄色
  error:   '\x1b[31m',   // 红色
  reset:   '\x1b[0m',
  dim:     '\x1b[2m',
  bold:    '\x1b[1m',
  cyan:    '\x1b[36m',
  green:   '\x1b[32m',
  magenta: '\x1b[35m',
  yellow:  '\x1b[33m',
  blue:    '\x1b[34m',
  white:   '\x1b[37m',
};

// 每级别行首图标（纯视觉，文件输出保留纯文本）
const LEVEL_ICON = { debug: '·', info: '◆', warn: '▲', error: '✖' };

// ─── 文件写入（按日轮换 + setImmediate 批量非阻塞）─────────────────
let _pendingLines   = [];
let _flushScheduled = false;
let _lastDate = '';
let _logFile  = '';

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function currentLogFile() {
  const today = todayStr();
  if (today !== _lastDate) {
    _lastDate = today;
    _logFile  = path.join(LOGS_DIR, `worldengine-${today}.log`);
    try { fs.mkdirSync(LOGS_DIR, { recursive: true }); } catch { /* ignore */ }
  }
  return _logFile;
}

const ANSI_RE  = /\x1b\[[0-9;]*m/g;
const stripAnsi = (s) => s.replace(ANSI_RE, '');

function flushToFile() {
  _flushScheduled = false;
  if (_pendingLines.length === 0) return;
  const lines = _pendingLines.splice(0);
  try { fs.appendFileSync(currentLogFile(), lines.join('\n') + '\n'); } catch { /* 写入失败静默，不影响终端日志 */ }
}

function writeToFile(plainLine, level) {
  if (!FILE_LOG_ENABLED || LEVEL_ORDER[level] < fileLogLevel) return;
  _pendingLines.push(plainLine);
  if (!_flushScheduled) {
    _flushScheduled = true;
    setImmediate(flushToFile);
  }
}

// ─── 工具函数 ──────────────────────────────────────────────────────
function timestamp() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

function formatArg(a) {
  if (typeof a === 'string') return a;
  if (a instanceof Error)   return `${a.name}: ${a.message}`;
  try { return JSON.stringify(a); } catch { return String(a); }
}

// ─── 核心写入 ──────────────────────────────────────────────────────
function write(level, tag, tagColor, args) {
  if (LEVEL_ORDER[level] < currentLevel) return;

  const lc   = C[level];
  const tc   = C[tagColor] ?? C.bold;
  const icon = LEVEL_ICON[level];
  const ts   = `${C.dim}${timestamp()}${C.reset}`;
  const lvl  = `${lc}${level.toUpperCase().padEnd(5)}${C.reset}`;
  const tagPad = (tag ?? '').padEnd(8);
  const tagStr = `${tc}[${tagPad}]${C.reset}`;
  const msg  = args.map(formatArg).join(' ');

  // 终端：彩色 + 图标
  const colorLine = `${ts} ${lvl} ${tagStr} ${lc}${icon}${C.reset} ${msg}`;
  // 文件：纯文本，去 ANSI（icon 保留便于 grep 筛选）
  const plainLine = `${timestamp()} ${level.toUpperCase().padEnd(5)} [${tagPad}] ${icon} ${msg}`;

  if (level === 'error')     console.error(colorLine);
  else if (level === 'warn') console.warn(colorLine);
  else                       console.log(colorLine);

  writeToFile(plainLine, level);
}

// ─── 对外 API ──────────────────────────────────────────────────────
/**
 * @param {string} tag       模块标签，如 'llm' / 'http' / 'chat'
 * @param {string} [color]   tag 颜色，如 'cyan' / 'magenta' / 'green' / 'yellow'
 */
export function createLogger(tag, color = 'bold') {
  return {
    debug: (...args) => write('debug', tag, color, args),
    info:  (...args) => write('info',  tag, color, args),
    warn:  (...args) => write('warn',  tag, color, args),
    error: (...args) => write('error', tag, color, args),
  };
}

/** 打印完整 prompt messages 数组（仅 debug 级别） */
export function logPrompt(sessionId, messages) {
  if (LEVEL_ORDER.debug < currentLevel) return;

  const SID  = sessionId ? sessionId.slice(0, 8) : '?';
  const SEP  = `${C.dim}${'─'.repeat(70)}${C.reset}`;
  const HEAD = `${C.bold}${C.cyan}${'═'.repeat(26)} PROMPT  session=${SID}  msgs=${messages.length} ${'═'.repeat(26)}${C.reset}`;
  const TAIL = `${C.bold}${C.cyan}${'═'.repeat(70)}${C.reset}`;

  const ROLE_COLOR = { system: C.magenta, user: C.green, assistant: C.cyan };

  const lines = [HEAD];
  for (const msg of messages) {
    const rc = ROLE_COLOR[msg.role] ?? C.reset;
    lines.push(SEP);
    let content;
    if (Array.isArray(msg.content)) {
      content = msg.content.find((p) => p.type === 'text')?.text ?? '[binary/vision]';
    } else {
      content = msg.content ?? '';
    }
    lines.push(`${rc}[${msg.role.toUpperCase()}]${C.reset} ${content}`);
  }
  lines.push(TAIL);
  console.log(lines.join('\n'));

  // 文件只写摘要行，避免大 prompt 撑大日志文件
  const totalChars = messages.reduce((s, m) => s + (typeof m.content === 'string' ? m.content.length : 0), 0);
  writeToFile(`${timestamp()} DEBUG  [logger  ] · PROMPT  session=${SID}  msgs=${messages.length}  chars=${totalChars}`, 'debug');
}
