import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractNextPromptOptions,
  stripAsstContext,
  stripDialoguePrefix,
  stripThinkBlocksFromText,
  stripTrailingStateBlocks,
  stripUserContext,
  unwrapSoloThinkBlock,
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

test('extractNextPromptOptions：think 内含 <next_prompt> 字面但正文未输出选项时，保留 think 块原样', () => {
  const raw = '<think>推理：我需要在末尾输出 <next_prompt> 标签</think>\n\n💕\n\n正文内容';
  const r = extractNextPromptOptions(raw);
  assert.equal(r.content, raw);
  assert.deepEqual(r.options, []);
});

test('extractNextPromptOptions：think 块外有合法 next_prompt 时正常提取且保留 think', () => {
  const raw = '<think>推理 <next_prompt> 字样</think>\n回复\n<next_prompt>\n选项A\n选项B\n</next_prompt>';
  const r = extractNextPromptOptions(raw);
  assert.equal(r.content, '<think>推理 <next_prompt> 字样</think>\n回复');
  assert.deepEqual(r.options, ['选项A', '选项B']);
});

test('extractNextPromptOptions：think 内嵌套字面 <think></think>+<next_prompt> 不被误闭合（kimi-coding 回归）', () => {
  // 模型回放系统提示里的格式规则，think 块内出现字面 <think>…</think> 和 <next_prompt></next_prompt>。
  // 非贪婪正则会就近闭合外层 think，把"末尾输出<next_prompt></next_prompt>"判为合法选项，吞掉正文。
  const raw = [
    '<think>',
    '规则：每轮开头输出<think>…</think>检查块',
    '选项格式：末尾输出<next_prompt></next_prompt>包裹三条选项',
    '</think>',
    '',
    '正文段落 1',
    '正文段落 2',
    '<next_prompt>',
    '选项A',
    '选项B',
    '选项C',
    '</next_prompt>',
  ].join('\n');
  const r = extractNextPromptOptions(raw);
  assert.ok(r.content.includes('正文段落 1'), 'content 必须保留正文');
  assert.ok(r.content.includes('正文段落 2'), 'content 必须保留正文');
  assert.deepEqual(r.options, ['选项A', '选项B', '选项C']);
});

test('stripThinkBlocksFromText：嵌套字面 <think></think> 不让外层就近闭合', () => {
  const raw = '<think>echo <think>inner</think> tail</think>\nBODY';
  // 栈式：外层 <think>(d=1) 内层 <think>(d=2) 内层 </think>(d=1) 外层 </think>(d=0) → 全部剥掉，仅留 BODY。
  assert.equal(stripThinkBlocksFromText(raw).trim(), 'BODY');
});

test('stripThinkBlocksFromText：未闭合 think 一直延伸到 EOF', () => {
  assert.equal(stripThinkBlocksFromText('前缀\n<think>无尽推理...'), '前缀\n');
});

test('stripThinkBlocksFromText：孤立 </think> 在 think 外当普通文本保留（与前端语义一致）', () => {
  assert.equal(stripThinkBlocksFromText('正文</think>尾'), '正文</think>尾');
});

test('stripThinkBlocksFromText：两开一闭失衡 EOF 兜底,首个 </think> 即闭合', () => {
  // 模型异常输出 <think>...<think>...</think>,栈式会让 depth 永远停在 1 把全文吞掉;
  // 失衡兜底回退到布尔语义,正文部分得以保留并继续走 next_prompt 抽取。
  assert.equal(
    stripThinkBlocksFromText('<think>A<think>B</think>正文 <next_prompt>opt</next_prompt>'),
    '正文 <next_prompt>opt</next_prompt>',
  );
});

test('unwrapSoloThinkBlock：整段被单个 think 包裹（DeepSeek reasoning 回灌）→ 解包', () => {
  assert.equal(unwrapSoloThinkBlock('<think>正文内容</think>'), '正文内容');
});

test('unwrapSoloThinkBlock：think 外仍有正文 → 原样返回', () => {
  const raw = '<think>推理</think>\n正文';
  assert.equal(unwrapSoloThinkBlock(raw), raw);
});

test('unwrapSoloThinkBlock：两开一闭失衡时 outerInner 必须连带尾部 </think>,避免持久化后变残缺 opener', () => {
  // 老 booleanScan 只截到 </think> 之前('A<think>B'),持久化后 re-strip 把 B 一并丢掉。
  // 新实现保留首个闭合标签,unwrap 结果 re-render 时 think 块会正常闭合而不是常驻 spinner。
  assert.equal(unwrapSoloThinkBlock('<think>A<think>B</think>'), 'A<think>B</think>');
});

test('extractNextPromptOptions：mode-divergence 回归——full 走 boolean 兜底,选项依旧能映射回原文', () => {
  // 老 findRawNextPromptIdx 对 prefix 再 strip,而该 prefix 自身平衡走栈式(返回 'D' 长度 1),
  // 与 full 的 boolean cleaned 中 <next_prompt> 偏移 10 永远对不上,选项会被丢弃 + 裸标签持久化。
  const raw = '<think>A<think>B</think>C</think>D<next_prompt>opt</next_prompt><think>unclosed';
  const r = extractNextPromptOptions(raw);
  assert.deepEqual(r.options, ['opt']);
  assert.equal(r.content, '<think>A<think>B</think>C</think>D');
});
