import test from 'node:test';
import assert from 'node:assert/strict';

import { extractPreviewText } from '../../utils/text-preview.js';

test('extractPreviewText：剥离 <think>…</think> 思考块', () => {
  assert.equal(extractPreviewText('<think>规划内容</think>正文'), '正文');
});

test('extractPreviewText：大小写不敏感 + <thinking> 变体', () => {
  assert.equal(extractPreviewText('<THINKING>规划</THINKING>正文'), '正文');
});

test('extractPreviewText：未闭合的思考块兜底丢弃到结尾', () => {
  assert.equal(extractPreviewText('正文在前<think>没写完的规划'), '正文在前');
});

test('extractPreviewText：整条消息只有思考块时返回 null', () => {
  assert.equal(extractPreviewText('<think>只有规划，没有正文</think>'), null);
});

test('extractPreviewText：剥离常见 markdown 标记', () => {
  assert.equal(extractPreviewText('# 标题\n**加粗** *斜体* `代码`\n> 引用'), '标题 加粗 斜体 代码 引用');
});

test('extractPreviewText：未加 <think> 标签、靠独立一行 --- 分隔"规划前缀+正文"时，取分隔线之后的内容', () => {
  const raw = '先确定本轮核心元素：A、B、C。\n\n---\n\n正式的正文内容从这里开始。';
  assert.equal(extractPreviewText(raw), '正式的正文内容从这里开始。');
});

test('extractPreviewText：有多个 --- 分节时取最后一节（预览展示最新剧情节拍）', () => {
  const raw = '第一节内容\n\n---\n\n第二节内容\n\n---\n\n第三节内容';
  assert.equal(extractPreviewText(raw), '第三节内容');
});

test('extractPreviewText：最后一节被 --- 分隔却是空白时，回退到前一节', () => {
  const raw = '真正的正文\n\n---\n\n   ';
  assert.equal(extractPreviewText(raw), '真正的正文');
});

test('extractPreviewText：空/空白输入安全返回 null', () => {
  assert.equal(extractPreviewText(''), null);
  assert.equal(extractPreviewText(null), null);
  assert.equal(extractPreviewText(undefined), null);
  assert.equal(extractPreviewText('   \n\t  '), null);
});
