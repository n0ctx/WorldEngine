/**
 * logger.js — 简单的分级带色彩终端日志工具
 *
 * 通过环境变量 LOG_LEVEL 控制输出级别：
 *   LOG_LEVEL=debug  — 输出所有级别（prompt 组装、LLM 调用、队列事件）
 *   LOG_LEVEL=info   — 输出 info / warn / error
 *   LOG_LEVEL=warn   — 仅输出 warn / error（默认）
 *   LOG_LEVEL=error  — 仅输出 error
 *
 * 用法：
 *   import { createLogger } from '../utils/logger.js';
 *   const log = createLogger('llm');
 *   log.debug('CHAT', provider, model);
 */

const LEVEL_ORDER = { debug: 0, info: 1, warn: 2, error: 3 };
const envLevel = process.env.LOG_LEVEL?.toLowerCase();
const currentLevel = LEVEL_ORDER[envLevel] ?? LEVEL_ORDER.warn;

const C = {
  debug: '\x1b[90m',   // 灰色
  info:  '\x1b[36m',   // 青色
  warn:  '\x1b[33m',   // 黄色
  error: '\x1b[31m',   // 红色
  reset: '\x1b[0m',
  dim:   '\x1b[2m',
  bold:  '\x1b[1m',
  cyan:  '\x1b[36m',
  green: '\x1b[32m',
  magenta: '\x1b[35m',
};

function timestamp() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

function formatArg(a) {
  if (typeof a === 'string') return a;
  if (a instanceof Error) return `${a.name}: ${a.message}`;
  try { return JSON.stringify(a); } catch { return String(a); }
}

function write(level, tag, args) {
  if (LEVEL_ORDER[level] < currentLevel) return;
  const c = C[level];
  const ts = `${C.dim}${timestamp()}${C.reset}`;
  const lvl = `${c}${level.toUpperCase().padEnd(5)}${C.reset}`;
  const tagStr = tag ? `${C.bold}[${tag}]${C.reset} ` : '';
  const msg = args.map(formatArg).join(' ');
  const line = `${ts} ${lvl} ${tagStr}${msg}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export function createLogger(tag) {
  return {
    debug: (...args) => write('debug', tag, args),
    info:  (...args) => write('info',  tag, args),
    warn:  (...args) => write('warn',  tag, args),
    error: (...args) => write('error', tag, args),
  };
}

/** 打印完整 prompt messages 数组（仅 debug 级别） */
export function logPrompt(sessionId, messages) {
  if (LEVEL_ORDER.debug < currentLevel) return;

  const SID = sessionId ? sessionId.slice(0, 8) : '?';
  const SEP  = `${C.dim}${'─'.repeat(70)}${C.reset}`;
  const HEAD = `${C.bold}${C.cyan}${'═'.repeat(28)} PROMPT  session=${SID}  msgs=${messages.length} ${'═'.repeat(28)}${C.reset}`;
  const TAIL = `${C.bold}${C.cyan}${'═'.repeat(70)}${C.reset}`;

  const ROLE_COLOR = {
    system:    C.magenta,
    user:      C.green,
    assistant: C.cyan,
  };

  const lines = [HEAD];
  for (const msg of messages) {
    const rc = ROLE_COLOR[msg.role] ?? C.reset;
    const roleLabel = `${rc}[${msg.role.toUpperCase()}]${C.reset}`;
    lines.push(SEP);
    let content;
    if (Array.isArray(msg.content)) {
      const textPart = msg.content.find((p) => p.type === 'text');
      content = textPart?.text ?? '[binary/vision content]';
    } else {
      content = msg.content ?? '';
    }
    lines.push(`${roleLabel} ${content}`);
  }
  lines.push(TAIL);
  console.log(lines.join('\n'));
}
