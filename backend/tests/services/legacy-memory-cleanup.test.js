import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createTestSandbox, freshImport } from '../helpers/test-env.js';

let sandbox;
let vectorsDir;
let longTermMemoryDir;
let removeLegacyMemoryData;

before(async () => {
  sandbox = createTestSandbox('legacy-memory-cleanup');
  sandbox.setEnv();

  vectorsDir = path.join(sandbox.root, 'vectors');
  longTermMemoryDir = path.join(sandbox.root, 'long_term_memory');

  fs.mkdirSync(vectorsDir, { recursive: true });
  fs.writeFileSync(path.join(vectorsDir, 'placeholder.json'), '{}');

  fs.mkdirSync(path.join(longTermMemoryDir, 'sub'), { recursive: true });
  fs.writeFileSync(path.join(longTermMemoryDir, 'sub', 'note.txt'), 'legacy');

  ({ removeLegacyMemoryData } = await freshImport('backend/services/legacy-memory-cleanup.js'));
});

after(() => {
  sandbox.cleanup();
});

describe('legacy-memory-cleanup', () => {
  it('删除 vectors 与 long_term_memory 目录，保留其他数据目录', () => {
    removeLegacyMemoryData();

    assert.equal(fs.existsSync(vectorsDir), false);
    assert.equal(fs.existsSync(longTermMemoryDir), false);
    assert.equal(fs.existsSync(sandbox.uploadsDir), true);
  });

  it('目录不存在时重复调用不报错', () => {
    assert.doesNotThrow(() => removeLegacyMemoryData());
  });
});
