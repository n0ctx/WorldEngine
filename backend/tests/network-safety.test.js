import test from 'node:test';
import assert from 'node:assert/strict';

import { validateModelFetchBaseUrl } from '../utils/network-safety.js';

test('允许本地 provider 使用 localhost 地址', function () {
  assert.equal(
    validateModelFetchBaseUrl('ollama', 'http://127.0.0.1:11434/'),
    'http://127.0.0.1:11434',
  );
});

test('拒绝本地 provider 指向非本机地址', function () {
  assert.throws(
    () => validateModelFetchBaseUrl('ollama', 'http://192.168.1.10:11434'),
    /仅允许 localhost/,
  );
});

test('拒绝远程 provider 使用 http', function () {
  assert.throws(
    () => validateModelFetchBaseUrl('openai_compatible', 'http://example.com/v1'),
    /必须使用 https/,
  );
});

test('拒绝远程 provider 指向私有网络', function () {
  assert.throws(
    () => validateModelFetchBaseUrl('openai_compatible', 'https://127.0.0.1:8443/v1'),
    /不允许指向本机或私有网络/,
  );
});
