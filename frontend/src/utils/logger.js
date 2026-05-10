const LEVEL_ORDER = { debug: 0, info: 1, warn: 2, error: 3 };
const TOAST_TYPE = { error: 'error', warn: 'warning', info: 'info', success: 'success' };

let consoleLevel = (() => {
  try {
    const fromUrl = new URLSearchParams(globalThis.location?.search || '').get('debug');
    if (fromUrl === '1') return 'debug';
  } catch { /* ignore */ }
  try {
    const ls = globalThis.localStorage?.getItem('we:log:level');
    if (ls && LEVEL_ORDER[ls] !== undefined) return ls;
  } catch { /* ignore */ }
  return import.meta.env?.DEV ? 'debug' : 'info';
})();

let _buffer = [];
let _dedupe = new Map();
const DEDUP_MS = 1500;

function dedupeKey(level, event, msg) { return `${level}|${event}|${msg}`; }

function extractError(payload) {
  if (payload instanceof Error) {
    return { message: payload.message, stack: payload.stack, status: payload.status };
  }
  return payload || {};
}

function emitToast(message, type) {
  if (!message) return;
  window.dispatchEvent(new CustomEvent('we:toast', { detail: { message, type } }));
}

function emitConsole(level, event, payload) {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[consoleLevel]) return;
  const fn = console[level] || console.log;
  fn(`[${event}]`, payload);
}

function shouldDefaultToast(level) { return level === 'warn' || level === 'error'; }
function shouldUpload(level) { return level === 'warn' || level === 'error'; }

function makeLog(level) {
  return (event, payload, opts = {}) => {
    const data = extractError(payload);
    emitConsole(level, event, data);

    let toastMsg = null;
    const toastType = TOAST_TYPE[level] ?? 'info';
    if (typeof opts.toast === 'string') toastMsg = opts.toast;
    else if (opts.toast === true) toastMsg = data.message || event;
    else if (shouldDefaultToast(level) && !opts.silent) toastMsg = data.message || event;

    if (toastMsg) {
      const key = dedupeKey(level, event, toastMsg);
      const last = _dedupe.get(key) || 0;
      if (Date.now() - last >= DEDUP_MS) {
        _dedupe.set(key, Date.now());
        emitToast(toastMsg, toastType);
      }
    }

    if (shouldUpload(level)) {
      _buffer.push({ level, event, ts: Date.now(), payload: data });
      _maybeFlush();
    }
  };
}

let _maybeFlush = () => {};

export function __setFlush(fn) { _maybeFlush = fn; }
export function __getBuffer() { return _buffer; }
export function __resetLoggerForTest() {
  _buffer = [];
  _dedupe = new Map();
  _maybeFlush = () => {};
}

export const log = {
  debug: makeLog('debug'),
  info: makeLog('info'),
  warn: makeLog('warn'),
  error: makeLog('error'),
};
