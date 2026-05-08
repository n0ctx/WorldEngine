import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractNextPromptOptions,
  stripAsstContext,
  stripDialoguePrefix,
  stripTrailingStateBlocks,
  stripUserContext,
} from '../../utils/turn-dialogue.js';

test('stripDialoguePrefix：命中第一个匹配前缀即剥除', () => {
  assert.equal(stripDialoguePrefix('A：你好', ['A：', 'B：']), '你好');
  assert.equal(stripDialoguePrefix('B：你好', ['A：', 'B：']), '你好');
});

test('stripDialoguePrefix：无匹配前缀时原样返回', () => {
  assert.equal(stripDialoguePrefix('普通文本', ['A：', 'B：']), '普通文本');
});

test('stripDialoguePrefix：空字符串与 nullish 安全', () => {
  assert.equal(stripDialoguePrefix(undefined, ['A：']), '');
  assert.equal(stripDialoguePrefix(null, ['A：']), '');
  assert.equal(stripDialoguePrefix('', ['A：']), '');
});

test('stripTrailingStateBlocks：剥除末尾的 [xx 状态] 块，保留主文本', () => {
  const text = '正文\n\n[世界状态]\n字段=值\n\n[角色状态]\nHP=10';
  assert.equal(stripTrailingStateBlocks(text), '正文');
});

test('stripTrailingStateBlocks：无状态块时原样返回', () => {
  assert.equal(stripTrailingStateBlocks('正文\n\n后续段落'), '正文\n\n后续段落');
});

test('stripUserContext / stripAsstContext：组合剥除', () => {
  assert.equal(stripUserContext('用户：嗨\n\n[世界状态]\nx=1'), '嗨');
  assert.equal(stripAsstContext('AI：好\n\n[角色状态]\nHP=10'), '好');
});

test('extractNextPromptOptions：无标签时原样返回', () => {
  const r = extractNextPromptOptions('正文没有标签');
  assert.equal(r.content, '正文没有标签');
  assert.deepEqual(r.options, []);
});

test('extractNextPromptOptions：完整闭合标签', () => {
  const r = extractNextPromptOptions('回复\n<next_prompt>\n选项A\n选项B\n</next_prompt>');
  assert.equal(r.content, '回复');
  assert.deepEqual(r.options, ['选项A', '选项B']);
});

test('extractNextPromptOptions：标签未闭合（截断）回退到匹配到结尾', () => {
  const r = extractNextPromptOptions('回复\n<next_prompt>\n选项A\n选项B');
  assert.equal(r.content, '回复');
  assert.deepEqual(r.options, ['选项A', '选项B']);
});

test('extractNextPromptOptions：空输入安全', () => {
  assert.deepEqual(extractNextPromptOptions(''), { content: '', options: [] });
  assert.deepEqual(extractNextPromptOptions(null), { content: '', options: [] });
});
