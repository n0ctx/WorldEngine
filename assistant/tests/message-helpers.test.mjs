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

test('工具失败只显示大白话，不暴露 ref、参数名和给模型的修正提示', () => {
  assert.equal(
    formatToolError('玩家卡 persona:8c638d6d-19b0-45d9-ab8f-f9be0b6b64ad 不存在；read("personas") 查看当前世界玩家卡'),
    '找不到这个玩家卡。',
  );
  assert.equal(
    formatToolError('content 中找不到 old_text：old_text 的前 15 个字符能对上；先 read("entry:8531e45b") 核对原文'),
    '要替换的原文没对上，这处没有改动。',
  );
  assert.equal(formatToolError('整批未写入（共 2 项，1 项有问题）：第 1 项 entry「缺正文」：缺少 content'), '这一批有内容不合格，全部没有写入。');
  assert.equal(formatToolError('提案格式错误：stateFieldOps[0].field_key 缺失'), '这一步没有成功，助手会调整后重试。');
});

test('批量调用的摘要按资源类型汇总', () => {
  assert.equal(formatToolSummary('entry×3 field×2', 'create'), '条目 ×3、状态字段 ×2');
  assert.equal(formatToolSummary('character×2', 'set_state'), '角色卡 ×2');
  assert.equal(formatToolSummary('unknown×2', 'delete'), 'unknown×2');
});
