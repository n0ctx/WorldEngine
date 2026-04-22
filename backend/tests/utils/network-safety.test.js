import test from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport } from '../helpers/test-env.js';

const sandbox = createTestSandbox('utils-network-safety-suite');
sandbox.setEnv();

test('validateModelFetchBaseUrl 会放行本地 provider 的 localhost http 地址并裁掉尾斜杠', async () => {
  const { validateModelFetchBaseUrl } = await freshImport('backend/utils/network-safety.js');
  assert.equal(
    validateModelFetchBaseUrl('ollama', 'http://127.0.0.1:11434/api/'),
    'http://127.0.0.1:11434/api',
  );
});

test('validateModelFetchBaseUrl 会拒绝本地 provider 指向远程主机', async () => {
  const { validateModelFetchBaseUrl } = await freshImport('backend/utils/network-safety.js');
  assert.throws(
    () => validateModelFetchBaseUrl('ollama', 'https://example.com'),
    /仅允许 localhost/,
  );
});

test('validateModelFetchBaseUrl 会拒绝远程 provider 的 http、本机和私网地址', async () => {
  const { validateModelFetchBaseUrl } = await freshImport('backend/utils/network-safety.js');
  assert.throws(() => validateModelFetchBaseUrl('openai', 'http://example.com/v1'), /必须使用 https/);
  assert.throws(() => validateModelFetchBaseUrl('openai', 'https://192.168.1.10/v1'), /私有网络/);
  assert.throws(() => validateModelFetchBaseUrl('openai', 'https://devbox.local/v1'), /私有网络/);
});

test('validateModelFetchBaseUrl 会放行远程 provider 的公网 https 地址', async () => {
  const { validateModelFetchBaseUrl } = await freshImport('backend/utils/network-safety.js');
  assert.equal(
    validateModelFetchBaseUrl('openai', 'https://api.openai.com/v1/'),
    'https://api.openai.com/v1',
  );
});
