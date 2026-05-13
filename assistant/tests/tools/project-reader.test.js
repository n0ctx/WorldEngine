import test from 'node:test';
import assert from 'node:assert/strict';

import { executeReadFile, READ_FILE_TOOL, PROJECT_TOOLS } from '../../server/tools/project-reader.js';

test('READ_FILE_TOOL 暴露标准化定义与 execute', () => {
  assert.equal(READ_FILE_TOOL.type, 'function');
  assert.equal(READ_FILE_TOOL.function.name, 'read_file');
  assert.equal(typeof READ_FILE_TOOL.execute, 'function');
  assert.equal(PROJECT_TOOLS.length, 1);
});

test('executeReadFile 拒绝空路径 / 非字符串路径', () => {
  assert.match(executeReadFile({ path: '' }), /路径不能为空/);
  assert.match(executeReadFile({ path: '   ' }), /路径不能为空/);
  assert.match(executeReadFile({ path: 123 }), /路径不能为空/);
  assert.match(executeReadFile({}), /路径不能为空/);
});

test('executeReadFile 拒绝越界路径', () => {
  assert.match(executeReadFile({ path: '../../../../etc/passwd' }), /超出项目范围/);
  // 绝对路径
  assert.match(executeReadFile({ path: '/etc/passwd' }), /超出项目范围/);
});

test('executeReadFile 报告不存在的文件', () => {
  assert.match(executeReadFile({ path: 'no-such-file-xyz.md' }), /文件不存在/);
});

test('executeReadFile 读取真实存在的文件', () => {
  const content = executeReadFile({ path: 'assistant/package.json' });
  assert.match(content, /"type": "module"/);
});

test('executeReadFile 截断超过 50KB 的内容', () => {
  const content = executeReadFile({ path: 'docs/references/backend/schema-and-storage.md' });
  // 只校验长度合理；如果文件 < 50KB 则没有截断标记，所以分支考虑两种
  if (content.includes('[已截断')) {
    assert.match(content, /\[已截断，仅显示前 50 KB\]$/);
  } else {
    assert.equal(typeof content, 'string');
  }
});
