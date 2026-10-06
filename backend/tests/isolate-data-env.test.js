import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { buildChildProcessEnv } from './helpers/test-env.js';

const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const preload = pathToFileURL(path.join(repoRoot, 'backend/tests/helpers/isolate-data-env.js')).href;

function readPathsWithPreload() {
  const env = buildChildProcessEnv({ LOG_FILE: 'false' });
  delete env.WE_DATA_DIR;
  delete env.WE_UPLOADS_DIR;
  const output = execFileSync(process.execPath, [
    '--import', preload,
    '--input-type=module',
    '-e',
    `const { DATA_ROOT, UPLOADS_DIR } = await import(${JSON.stringify(pathToFileURL(path.join(repoRoot, 'backend/utils/data-dir.js')).href)});
     console.log(JSON.stringify({ DATA_ROOT, UPLOADS_DIR, uploadsEnv: process.env.WE_UPLOADS_DIR }));`,
  ], { cwd: repoRoot, env, encoding: 'utf-8' });
  return JSON.parse(output.trim().split('\n').at(-1));
}

test('预加载后未设 WE_DATA_DIR 的测试进程不会落到仓库 data/，退出时删除临时目录', () => {
  const { DATA_ROOT, UPLOADS_DIR, uploadsEnv } = readPathsWithPreload();

  assert.notEqual(DATA_ROOT, path.join(repoRoot, 'data'));
  assert.ok(DATA_ROOT.startsWith(path.join(repoRoot, '.temp', 'backend-tests')), DATA_ROOT);
  assert.equal(UPLOADS_DIR, path.join(DATA_ROOT, 'uploads'));
  assert.equal(uploadsEnv, path.join(DATA_ROOT, 'uploads'));
  assert.equal(fs.existsSync(DATA_ROOT), false);
});
