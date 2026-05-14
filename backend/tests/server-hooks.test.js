import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { buildChildProcessEnv, createTestConfig } from './helpers/test-env.js';

const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const hooksDir = path.join(repoRoot, 'hooks');

test('server 启动会在 initSchema 之后加载用户 hooks', async () => {
  const root = path.join(repoRoot, '.temp', 'backend-tests', `server-hooks-order-${Date.now()}`);
  const dbPath = path.join(root, 'worldengine.test.db');
  const configPath = path.join(root, 'config.json');
  const uploadsDir = path.join(root, 'uploads');
  const vectorsDir = path.join(root, 'vectors');
  const assistantStateDir = path.join(root, 'assistant-state');
  const turnSummaryStorePath = path.join(vectorsDir, 'turn_summaries.json');
  const hookName = `__schema-init-order-${Date.now()}.js`;
  const hookPath = path.join(hooksDir, hookName);

  fs.mkdirSync(uploadsDir, { recursive: true });
  fs.mkdirSync(vectorsDir, { recursive: true });
  fs.mkdirSync(assistantStateDir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(createTestConfig(), null, 2));
  fs.mkdirSync(hooksDir, { recursive: true });
  fs.writeFileSync(hookPath, `
import db from '../backend/db/index.js';

export default function register({ registerHook }) {
  db.prepare('SELECT COUNT(*) AS count FROM worlds').get();
  registerHook('test:schema:init-order', async () => {});
}
`);

  try {
    const output = execFileSync(process.execPath, [
      '--input-type=module',
      '-e',
      `
        process.env.WE_DB_PATH = ${JSON.stringify(dbPath)};
        process.env.WE_CONFIG_PATH = ${JSON.stringify(configPath)};
        process.env.WE_DATA_DIR = ${JSON.stringify(root)};
        process.env.WE_UPLOADS_DIR = ${JSON.stringify(uploadsDir)};
        process.env.WE_TURN_SUMMARY_STORE_PATH = ${JSON.stringify(turnSummaryStorePath)};
        process.env.ASSISTANT_STATE_DIR = ${JSON.stringify(assistantStateDir)};
        process.env.WE_DISABLE_AUTOSTART = 'true';
        process.env.LOG_FILE = 'false';
        await import(${JSON.stringify(path.join(repoRoot, 'backend/server.js'))});
        const { listHooks } = await import(${JSON.stringify(path.join(repoRoot, 'backend/hooks/hook-registry.js'))});
        const count = listHooks().get('test:schema:init-order') || 0;
        process.stdout.write(String(count));
      `,
    ], {
      cwd: repoRoot,
      env: buildChildProcessEnv(),
      encoding: 'utf-8',
    }).trim();

    assert.equal(output, '1');
  } finally {
    fs.rmSync(hookPath, { force: true });
    fs.rmSync(root, { recursive: true, force: true });
  }
});
