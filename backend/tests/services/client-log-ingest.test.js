import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const TEMP_ROOT = path.join(REPO_ROOT, '.temp', 'client-log-ingest');
fs.mkdirSync(TEMP_ROOT, { recursive: true });
const root = fs.mkdtempSync(path.join(TEMP_ROOT, 'shared-'));
const logsDir = path.join(root, 'logs');

process.env.WE_DATA_DIR = root;
process.env.LOG_LEVEL = 'debug';
process.env.LOG_FILE = 'true';
process.env.LOG_FILE_LEVEL = 'debug';

let ingest;
before(async () => {
  const mod = await import(pathToFileURL(path.resolve(REPO_ROOT, 'backend/services/client-log-ingest.js')).href);
  ingest = mod.ingestClientLogs;
});

describe('client-log-ingest', () => {
  it('合法 logs 全部接受，dropped 为 0', () => {
    const result = ingest({
      client: { ua: 'UA', page: '/x', session: 'fe1', ts: 1 },
      logs: [
        { level: 'error', event: 'a.b.c', ts: 1, payload: { foo: 1 } },
        { level: 'warn',  event: 'd.e.f', ts: 2, payload: { bar: 2 } },
      ],
    });
    assert.equal(result.accepted, 2);
    assert.equal(result.dropped, 0);
  });

  it('非法 level 静默丢弃', () => {
    const result = ingest({
      client: { ua: 'UA', page: '/x', session: 'fe1', ts: 1 },
      logs: [{ level: 'fatal', event: 'x', ts: 1 }],
    });
    assert.equal(result.accepted, 0);
    assert.equal(result.dropped, 1);
  });

  it('缺少 event 字段被丢弃', () => {
    const result = ingest({
      client: { ua: 'UA', page: '/x' },
      logs: [{ level: 'error', ts: 1 }],
    });
    assert.equal(result.accepted, 0);
    assert.equal(result.dropped, 1);
  });

  it('日志文件含 [client 前缀的写入', () => {
    ingest({
      client: { ua: 'UA', page: '/file-test', session: 'fe1', ts: 1 },
      logs: [{ level: 'error', event: 'persisted.event', ts: 1 }],
    });
    return new Promise((resolve) => setImmediate(() => {
      const files = fs.readdirSync(logsDir).sort();
      const content = fs.readFileSync(path.join(logsDir, files[files.length - 1]), 'utf-8');
      assert.match(content, /\[client/);
      assert.match(content, /persisted\.event/);
      resolve();
    }));
  });
});
