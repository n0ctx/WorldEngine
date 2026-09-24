import test from 'node:test';
import assert from 'node:assert/strict';

import { findRegenerateSource, formatToolError, formatToolSummary } from '../client/message-helpers.js';

test('findRegenerateSource 跳过工具调用记录，返回最近一条 user', () => {
  const result = findRegenerateSource(
    [
      { id: 'u1', role: 'user', content: '做一张角色卡' },
      { id: 'call-1', role: 'tool_call', toolName: 'read', summary: 'world', status: 'done' },
      { id: 'call-2', role: 'tool_call', toolName: 'create', summary: 'character 沈渡', status: 'done' },
      { id: 'a1', role: 'assistant', content: '这是结果' },
    ],
    'a1',
  );

  assert.deepEqual(result, {
    index: 0,
    message: { id: 'u1', role: 'user', content: '做一张角色卡' },
  });
});

test('findRegenerateSource 遇到上一轮 assistant 时停止，避免串到更早 user', () => {
  const result = findRegenerateSource(
    [
      { id: 'u1', role: 'user', content: '第一轮' },
      { id: 'a1', role: 'assistant', content: '第一轮回复' },
      { id: 'call-3', role: 'tool_call', toolName: 'read', status: 'done' },
      { id: 'a2', role: 'assistant', content: '孤立回复' },
    ],
    'a2',
  );

  assert.equal(result, null);
});

test('工具记录显示资源名称，不暴露内部引用', () => {
  assert.equal(formatToolSummary('persona:8c638d6d-19b0-45d9-ab8f-f9be0b6b64ad', 'set_state'), '玩家卡');
  assert.equal(formatToolSummary('character 沈渡', 'create'), '角色卡 沈渡');
  assert.equal(formatToolSummary('personas', 'read'), '玩家卡列表');
  assert.equal(formatToolSummary('field:persona.health', 'update'), '状态字段');
  assert.equal(formatToolSummary('persona:8c638d6d-19b0-45d9-ab8f-f9be0b6b64ad system_prompt', 'edit'), '玩家卡的人设');
  assert.equal(formatToolSummary('character:c1 first_message', 'edit'), '角色卡的开场白');
  assert.equal(formatToolSummary('persona:p1 unknown_field', 'edit'), '玩家卡');
  assert.equal(formatToolSummary('world', 'find'), 'world');
});

test('玩家卡不存在时显示可理解的提示，不暴露内部命令', () => {
  assert.equal(
    formatToolError('玩家卡 persona:8c638d6d-19b0-45d9-ab8f-f9be0b6b64ad 不存在；read("personas") 查看当前世界玩家卡'),
    '找不到这张玩家卡。请让助手重新查找当前世界的玩家卡后重试。',
  );
  assert.equal(formatToolError('字段 生命 的值 999 不符合类型 number'), '字段 生命 的值 999 不符合类型 number');
});
