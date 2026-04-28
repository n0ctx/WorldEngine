import test, { before, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const TEMP_ROOT = path.join(REPO_ROOT, '.temp', 'logger-extra');

fs.mkdirSync(TEMP_ROOT, { recursive: true });
const root = fs.mkdtempSync(path.join(TEMP_ROOT, 'shared-'));
const configPath = path.join(root, 'config.json');
const logsDir = path.join(root, 'logs');

process.env.WE_DATA_DIR = root;
process.env.WE_CONFIG_PATH = configPath;
process.env.LOG_LEVEL = 'error';
process.env.LOG_FILE = 'true';
process.env.LOG_FILE_LEVEL = 'debug';

let mod;
before(async () => {
  writeConfig({ logging: {} });
  mod = await import(pathToFileURL(path.resolve(REPO_ROOT, 'backend/utils/logger.js')).href);
});

function readLatestLog() {
  if (!fs.existsSync(logsDir)) return '';
  const files = fs.readdirSync(logsDir).sort();
  if (!files.length) return '';
  return fs.readFileSync(path.join(logsDir, files[files.length - 1]), 'utf-8');
}

let logCheckpoint = 0;
afterEach(() => {
  logCheckpoint = readLatestLog().length;
});

function readNewLog() {
  return readLatestLog().slice(logCheckpoint);
}

after(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function writeConfig(body) {
  fs.writeFileSync(configPath, JSON.stringify(body));
  // 强制改 mtime 让 logger 缓存失效（同毫秒写两次时缓存会命中）
  const t = Date.now() / 1000 + Math.random();
  fs.utimesSync(configPath, t, t);
}

test('previewText 在长文本上 SNIP 截断，且小于阈值时原样返回', () => {
  writeConfig({ logging: { max_preview_chars: 200 } });
  assert.equal(mod.previewText(null), '');
  assert.equal(mod.previewText(''), '');
  assert.equal(mod.previewText('hello   world'), 'hello world');
  const long = 'a'.repeat(500);
  const out = mod.previewText(long);
  assert.match(out, /\.\.\.SNIP\.\.\./);
  assert.ok(out.length < long.length);
});

test('previewText 接受 limit option 覆盖配置', () => {
  const out = mod.previewText('a'.repeat(500), { limit: 50 });
  assert.match(out, /SNIP/);
  assert.ok(out.length < 100);
});

test('previewJson 处理对象、字符串、循环引用回退', () => {
  assert.equal(mod.previewJson(null), '');
  assert.equal(mod.previewJson('plain'), 'plain');
  assert.match(mod.previewJson({ a: 1, b: [1, 2] }), /"a":1/);
  const cyclic = {};
  cyclic.self = cyclic;
  assert.ok(typeof mod.previewJson(cyclic) === 'string');
});

test('summarizeMessages 计数角色与内容长度，支持数组型 content', () => {
  const result = mod.summarizeMessages([
    { role: 'user', content: 'hi' },
    { role: 'assistant', content: [{ type: 'text', text: 'hello' }, { type: 'image' }] },
    { role: 'user', content: 'bye' },
    { content: 'unknown role' },
  ]);
  assert.equal(result.count, 4);
  assert.equal(result.chars, 2 + 5 + 3 + 'unknown role'.length);
  assert.equal(result.roles.user, 2);
  assert.equal(result.roles.assistant, 1);
  assert.equal(result.roles.unknown, 1);
});

test('formatMeta 格式化各种类型并跳过 undefined', () => {
  const out = mod.formatMeta({
    a: 'hello', b: 42, c: null, d: undefined, e: [1, 2], f: { x: 1 },
  });
  assert.match(out, /a="hello"/);
  assert.match(out, /b=42/);
  assert.match(out, /c=null/);
  assert.doesNotMatch(out, /d=/);
  assert.match(out, /e=\[1,2\]/);
  assert.match(out, /f=\{"x":1\}/);
});

test('shouldLogRaw 在 mode=metadata 下始终返回 false', () => {
  writeConfig({ logging: { mode: 'metadata', prompt: { enabled: true }, llm_raw: { enabled: true } } });
  assert.equal(mod.shouldLogRaw('prompt'), false);
  assert.equal(mod.shouldLogRaw('llm_raw'), false);
  assert.equal(mod.shouldLogRaw('default'), false);
});

test('shouldLogRaw 在 mode=raw 下分别尊重 prompt/llm_raw 开关', () => {
  writeConfig({ logging: { mode: 'raw', prompt: { enabled: true }, llm_raw: { enabled: false } } });
  assert.equal(mod.getLogMode(), 'raw');
  assert.equal(mod.shouldLogRaw('prompt'), true);
  assert.equal(mod.shouldLogRaw('llm_raw'), false);
  assert.equal(mod.shouldLogRaw('default'), true);
});

test('getLoggingConfig 在 config 文件缺失时回退到默认值', () => {
  fs.rmSync(configPath, { force: true });
  const cfg = mod.getLoggingConfig();
  assert.equal(cfg.mode, 'metadata');
  assert.equal(cfg.max_preview_chars, 600);
  // 恢复
  writeConfig({ logging: {} });
});

test('getLoggingConfig 兼容顶层 log_prompt 字段（旧格式）', () => {
  writeConfig({ log_prompt: true, logging: { mode: 'raw' } });
  const cfg = mod.getLoggingConfig();
  assert.equal(cfg.prompt.enabled, true);
});

test('getLoggingConfig 在 max_preview_chars 非法时使用最小值 120', () => {
  writeConfig({ logging: { max_preview_chars: 10 } });
  const cfg = mod.getLoggingConfig();
  assert.equal(cfg.max_preview_chars, 120);
});

test('createLogger 写入日志文件并按级别过滤（debug 级别）', async () => {
  writeConfig({ logging: {} });
  mod.createLogger('dbg-test').debug('debug-msg-write');
  await new Promise((r) => setTimeout(r, 25));
  const content = readNewLog();
  assert.match(content, /debug-msg-write/);
});

test('createLogger 写入 info/warn/error 三种级别', async () => {
  const log = mod.createLogger('lvl-test');
  log.info('info-line');
  log.warn('warn-line');
  log.error('error-line');
  await new Promise((r) => setTimeout(r, 25));
  const content = readNewLog();
  assert.match(content, /info-line/);
  assert.match(content, /warn-line/);
  assert.match(content, /error-line/);
});

test('logPrompt 在 prompt.enabled+raw 时写 RAW 行', async () => {
  writeConfig({ logging: { mode: 'raw', prompt: { enabled: true } } });
  process.env.LOG_LEVEL = 'debug';
  mod.logPrompt('session-abc12345', [
    { role: 'system', content: 'sys' },
    { role: 'user', content: [{ type: 'text', text: 'q' }] },
    { role: 'assistant', content: [{ type: 'image' }] },
  ]);
  await new Promise((r) => setTimeout(r, 25));
  const content = readNewLog();
  assert.match(content, /PROMPT/);
  assert.match(content, /PROMPT RAW/);
  process.env.LOG_LEVEL = 'error';
});

test('logPrompt 在 prompt.enabled=false 时只写 META，不写 RAW', async () => {
  writeConfig({ logging: { mode: 'raw', prompt: { enabled: false } } });
  process.env.LOG_LEVEL = 'debug';
  mod.logPrompt('session-disabled', [{ role: 'user', content: 'x' }]);
  await new Promise((r) => setTimeout(r, 25));
  const content = readNewLog();
  assert.match(content, /PROMPT/);
  assert.doesNotMatch(content, /PROMPT RAW/);
  process.env.LOG_LEVEL = 'error';
});

test('logPrompt 在 mode=metadata + prompt.enabled 时写 META disabled 提示', async () => {
  writeConfig({ logging: { mode: 'metadata', prompt: { enabled: true } } });
  process.env.LOG_LEVEL = 'debug';
  mod.logPrompt('session-meta', [{ role: 'user', content: 'x' }]);
  await new Promise((r) => setTimeout(r, 25));
  const content = readNewLog();
  assert.match(content, /PROMPT META/);
  assert.match(content, /disabled\(raw=false\)/);
  process.env.LOG_LEVEL = 'error';
});

test('spinnerAdd / spinnerRemove 在非 TTY 下安全 no-op', () => {
  const id = mod.spinnerAdd('loading');
  assert.equal(typeof id, 'number');
  mod.spinnerRemove(id);
  mod.spinnerRemove(id);
});
