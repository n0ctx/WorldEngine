import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createTestSandbox } from '../helpers/test-env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
async function loadModule(rel) {
  return import(pathToFileURL(path.resolve(REPO_ROOT, rel)).href);
}

const sandbox = createTestSandbox('utils-network-safety-extra');
sandbox.setEnv();

test('validateModelFetchBaseUrl 空 baseUrl 直接返回空字符串', async () => {
  const { validateModelFetchBaseUrl } = await loadModule('backend/utils/network-safety.js');
  assert.equal(validateModelFetchBaseUrl('openai', ''), '');
  assert.equal(validateModelFetchBaseUrl('ollama', null), '');
  assert.equal(validateModelFetchBaseUrl('lmstudio', undefined), '');
});

test('validateModelFetchBaseUrl 非法 URL 抛错', async () => {
  const { validateModelFetchBaseUrl } = await loadModule('backend/utils/network-safety.js');
  assert.throws(() => validateModelFetchBaseUrl('openai', 'not a url'), /格式不合法/);
  assert.throws(() => validateModelFetchBaseUrl('openai', '://broken'), /格式不合法/);
});

test('validateModelFetchBaseUrl 本地 provider 拒绝非 http/https 协议', async () => {
  const { validateModelFetchBaseUrl } = await loadModule('backend/utils/network-safety.js');
  assert.throws(
    () => validateModelFetchBaseUrl('ollama', 'ftp://localhost/api'),
    /只支持 http\/https/,
  );
  assert.throws(
    () => validateModelFetchBaseUrl('lmstudio', 'ws://127.0.0.1/api'),
    /只支持 http\/https/,
  );
});

test('validateModelFetchBaseUrl 本地 provider 接受 ::1 与 localhost', async () => {
  const { validateModelFetchBaseUrl } = await loadModule('backend/utils/network-safety.js');
  assert.equal(
    validateModelFetchBaseUrl('lmstudio', 'http://localhost:1234/v1/'),
    'http://localhost:1234/v1',
  );
  assert.equal(
    validateModelFetchBaseUrl('lmstudio', 'http://[::1]:1234/v1/'),
    'http://[::1]:1234/v1',
  );
});

test('validateModelFetchBaseUrl 远程 provider 拒绝多种私网与本机 IP', async () => {
  const { validateModelFetchBaseUrl } = await loadModule('backend/utils/network-safety.js');
  for (const url of [
    'https://10.0.0.1/v1',
    'https://172.16.0.1/v1',
    'https://172.31.255.255/v1',
    'https://169.254.169.254/v1',
    'https://127.0.0.1/v1',
    'https://localhost/v1',
    'https://0.0.0.0/v1',
  ]) {
    assert.throws(() => validateModelFetchBaseUrl('openai', url), /(本机|私有网络|仅允许)/, `应拒绝 ${url}`);
  }
});

test('validateModelFetchBaseUrl 公网 IPv4 放行', async () => {
  const { validateModelFetchBaseUrl } = await loadModule('backend/utils/network-safety.js');
  assert.equal(
    validateModelFetchBaseUrl('openai', 'https://8.8.8.8/v1'),
    'https://8.8.8.8/v1',
  );
});

test('validateModelFetchBaseUrl 远程 provider 对 IPv6 字面量正确区分公网与私网', async () => {
  const { validateModelFetchBaseUrl } = await loadModule('backend/utils/network-safety.js');
  // 公网 IPv6 放行
  assert.equal(
    validateModelFetchBaseUrl('openai', 'https://[2001:4860:4860::8888]/v1'),
    'https://[2001:4860:4860::8888]/v1',
  );
  // IPv6 本机/链路本地/唯一本地应被拒绝
  for (const url of [
    'https://[::1]/v1',
    'https://[fe80::1]/v1',
    'https://[fc00::1]/v1',
    'https://[fd00::1]/v1',
  ]) {
    assert.throws(() => validateModelFetchBaseUrl('openai', url), /(本机|私有网络|仅允许)/, `应拒绝 ${url}`);
  }
});
