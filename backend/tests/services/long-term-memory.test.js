import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createTestSandbox, freshImport, resetMockEnv } from '../helpers/test-env.js';
import { LONG_TERM_MEMORY_MAX_LINES } from '../../utils/constants.js';

const sandbox = createTestSandbox('service-long-term-memory');
sandbox.setEnv();

const ltm = await freshImport('backend/services/long-term-memory.js');

after(() => {
  resetMockEnv();
  sandbox.cleanup();
});

beforeEach(() => {
  resetMockEnv();
});

const SID = 'session-ltm-test';

function ltmFile() {
  return path.join(sandbox.root, 'long_term_memory', SID, 'memory.md');
}

test('readMemoryFile 在文件不存在时返回空串', () => {
  ltm.deleteMemoryDir(SID);
  assert.equal(ltm.readMemoryFile(SID), '');
});

test('writeMemoryFile 会递归建目录并写入', () => {
  ltm.deleteMemoryDir(SID);
  ltm.writeMemoryFile(SID, 'hello\nworld');
  const onDisk = fs.readFileSync(ltmFile(), 'utf-8');
  assert.equal(onDisk, 'hello\nworld');
});

test('appendMemoryLines 正常追加，去空行/合并空白/截长', async () => {
  ltm.deleteMemoryDir(SID);
  await ltm.appendMemoryLines(SID, ['  第一行  ', '', '第\t二行', null]);
  const after1 = ltm.readMemoryFile(SID);
  assert.match(after1, /第一行\n第 二行\n/);

  await ltm.appendMemoryLines(SID, ['第三行']);
  const after2 = ltm.readMemoryFile(SID);
  assert.match(after2, /第三行\n$/);
  assert.equal(after2.split('\n').filter((l) => l.trim()).length, 3);
});

test('appendMemoryLines 仅空内容时直接 return', async () => {
  ltm.deleteMemoryDir(SID);
  await ltm.appendMemoryLines(SID, ['', null, '   ']);
  assert.equal(ltm.readMemoryFile(SID), '');
});

test('appendMemoryLines 超过 MAX_LINES 时触发 compress（mock LLM 返回受控）', async () => {
  ltm.deleteMemoryDir(SID);
  // 预填 MAX_LINES 行
  const lines = Array.from({ length: LONG_TERM_MEMORY_MAX_LINES }, (_, i) => `行${i}`);
  ltm.writeMemoryFile(SID, lines.join('\n') + '\n');

  process.env.MOCK_LLM_COMPLETE = '- 浓缩A\n- 浓缩B\n* 浓缩C';
  await ltm.appendMemoryLines(SID, ['触发压缩']);

  const after = ltm.readMemoryFile(SID);
  // 压缩后应只有三行，bullet 前缀已剥离
  assert.equal(after.trim().split('\n').length, 3);
  assert.match(after, /浓缩A/);
  assert.doesNotMatch(after, /^\s*[-*]\s/m);
});

test('compressMemory 在内容为空时直接 return', async () => {
  ltm.deleteMemoryDir(SID);
  await ltm.compressMemory(SID); // 不应抛错
  assert.equal(ltm.readMemoryFile(SID), '');
});

test('compressMemory 剥离 <think> 段落', async () => {
  ltm.deleteMemoryDir(SID);
  ltm.writeMemoryFile(SID, '原始-1\n原始-2\n');
  process.env.MOCK_LLM_COMPLETE = '<think>思考过程</think>\n精简A\n精简B';
  await ltm.compressMemory(SID);
  const after = ltm.readMemoryFile(SID);
  assert.doesNotMatch(after, /<think>/);
  assert.match(after, /精简A\n精简B/);
});

test('compressMemory LLM 返回空时记录 warn 但不写文件', async () => {
  ltm.deleteMemoryDir(SID);
  ltm.writeMemoryFile(SID, '原始内容\n');
  process.env.MOCK_LLM_COMPLETE = '   \n  ';
  await ltm.compressMemory(SID);
  // 文件保持原样
  assert.equal(ltm.readMemoryFile(SID), '原始内容\n');
});

test('appendMemoryLines 在 compress 抛错时仅 warn，不向上抛', async () => {
  ltm.deleteMemoryDir(SID);
  const lines = Array.from({ length: LONG_TERM_MEMORY_MAX_LINES }, (_, i) => `行${i}`);
  ltm.writeMemoryFile(SID, lines.join('\n') + '\n');
  process.env.MOCK_LLM_COMPLETE_ERROR = 'llm down';
  await ltm.appendMemoryLines(SID, ['再追一行']);
  // 不抛错，并且文件至少包含追加结果
  const after = ltm.readMemoryFile(SID);
  assert.match(after, /再追一行/);
});

test('restoreLtmFromTurnRecord：lastRecord 为空时清空目录', () => {
  ltm.writeMemoryFile(SID, '内容');
  assert.ok(fs.existsSync(ltmFile()));
  ltm.restoreLtmFromTurnRecord(SID, null);
  assert.equal(ltm.readMemoryFile(SID), '');
});

test('restoreLtmFromTurnRecord：snapshot==null 时跳过（保持文件不动）', () => {
  ltm.writeMemoryFile(SID, '保留内容');
  ltm.restoreLtmFromTurnRecord(SID, { round_index: 1, long_term_memory_snapshot: null });
  assert.equal(ltm.readMemoryFile(SID), '保留内容');
});

test('restoreLtmFromTurnRecord：用 snapshot 覆盖写入', () => {
  ltm.deleteMemoryDir(SID);
  ltm.restoreLtmFromTurnRecord(SID, { round_index: 2, long_term_memory_snapshot: 'A\nB\n' });
  assert.equal(ltm.readMemoryFile(SID), 'A\nB\n');
});

test('deleteMemoryDir 安全：目录不存在时不抛', () => {
  ltm.deleteMemoryDir('non-existent-session-xyz');
});
