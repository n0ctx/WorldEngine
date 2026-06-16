import { postClientLogs, sendClientLogsBeacon } from '../api/client-logs.js';

const LEVEL_ORDER = { debug: 0, info: 1, warn: 2, error: 3 };
const TOAST_TYPE = { error: 'error', warn: 'warning', info: 'info', success: 'success' };

const FLUSH_BATCH = 20;
const FLUSH_INTERVAL_MS = 5000;
const BUFFER_CAP = 500;
const RETRY_KEY = 'we:log:retry';
const RETRY_CAP = 200;
const POST_BATCH_MAX = 100;
const DEDUP_MS = 1500;

const consoleLevel = (() => {
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
let _flushTimer = null;
let _droppedCount = 0;
let _feSessionId = null;
let _flushing = false;

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
  if (_flushTimer) { clearTimeout(_flushTimer); _flushTimer = null; }
  _droppedCount = 0;
  _flushing = false;
  if (typeof localStorage !== 'undefined') {
    try { localStorage.removeItem('we:log:retry'); } catch { /* ignore */ }
  }
}

export const log = {
  debug: makeLog('debug'),
  info: makeLog('info'),
  warn: makeLog('warn'),
  error: makeLog('error'),
};

function feSession() {
  if (_feSessionId) return _feSessionId;
  try {
    let id = sessionStorage.getItem('we:log:session');
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem('we:log:session', id);
    }
    _feSessionId = id;
  } catch {
    _feSessionId = crypto.randomUUID();
  }
  return _feSessionId;
}

function loadRetry() {
  try {
    return JSON.parse(localStorage.getItem(RETRY_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveRetry(arr) {
  try {
    localStorage.setItem(RETRY_KEY, JSON.stringify(arr.slice(-RETRY_CAP)));
  } catch {
    /* ignore */
  }
}

function clientMeta() {
  return {
    ua: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    page: typeof location !== 'undefined' ? location.pathname + location.search : '',
    session: feSession(),
    ts: Date.now(),
  };
}

async function doFlush({ useBeacon = false } = {}) {
  if (_flushing && !useBeacon) return;
  if (_flushTimer) {
    clearTimeout(_flushTimer);
    _flushTimer = null;
  }
  const retry = loadRetry();
  if (_buffer.length === 0 && retry.length === 0) return;

  const merged = [...retry, ..._buffer].slice(-POST_BATCH_MAX);
  _buffer = [];
  saveRetry([]);

  const body = {
    client: { ...clientMeta(), dropped: _droppedCount },
    logs: merged,
  };
  _droppedCount = 0;

  if (useBeacon) {
    sendClientLogsBeacon(body);
    return;
  }

  _flushing = true;
  try {
    await postClientLogs(body);
  } catch {
    saveRetry([...loadRetry(), ...merged]);
  } finally {
    _flushing = false;
  }
}

function scheduleFlush() {
  if (_flushTimer) return;
  _flushTimer = setTimeout(() => {
    _flushTimer = null;
    doFlush();
  }, FLUSH_INTERVAL_MS);
}

__setFlush(() => {
  if (_buffer.length > BUFFER_CAP) {
    _droppedCount += _buffer.length - BUFFER_CAP;
    _buffer = _buffer.slice(-BUFFER_CAP);
  }
  if (_buffer.length >= FLUSH_BATCH) {
    doFlush();
    return;
  }
  if (_buffer.some((e) => e.level === 'error')) {
    doFlush();
    return;
  }
  scheduleFlush();
});

if (typeof window !== 'undefined') {
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') doFlush({ useBeacon: true });
  });
  window.addEventListener('pagehide', () => doFlush({ useBeacon: true }));
}
