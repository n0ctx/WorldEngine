import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport } from '../../backend/tests/helpers/test-env.js';

const sandbox = createTestSandbox('assistant-workspace-edit');
sandbox.setEnv();

const { createWorkspace } = await freshImport('assistant/server/workspace/index.js');
const { buildTools } = await freshImport('assistant/server/tools/index.js');

after(() => sandbox.cleanup());

const refOf = (message, kind) => message.match(new RegExp(`${kind}:[\\w.-]+`))[0];

async function newWorld(name) {
  const ws = createWorkspace({});
  await ws.create('world', { name, profile: { 时间: '1024-03-05' } });
  return ws;
}

async function newEntry(ws, content, extra = {}) {
  return refOf(await ws.create('entry', { title: '条目', content, ...extra }), 'entry');
}

const contentOf = (ws, ref) => JSON.parse(ws.read(ref)).content;

test('edit：同一资源一次改多处，replace_all 换掉全部出现处', async () => {
  const ws = await newWorld('edit-multi');
  const ref = await newEntry(ws, '阿澈住在城南。阿澈每日采药。', { description: '关于阿澈' });

  const receipt = await ws.editMany(ref, [
    { field: 'content', old_text: '阿澈', new_text: '沈渡', replace_all: true },
    { field: 'content', old_text: '城南', new_text: '城北' },
    { field: 'description', old_text: '阿澈', new_text: '沈渡' },
  ]);
  assert.match(receipt, /已更新 entry:[\w-]+（替换 4 处）/);
  assert.equal(contentOf(ws, ref), '沈渡住在城北。沈渡每日采药。');
  assert.equal(JSON.parse(ws.read(ref)).description, '关于沈渡');
});

test('edit：有一处对不上时整次不写，并指出是第几处', async () => {
  const ws = await newWorld('edit-atomic');
  const ref = await newEntry(ws, '阿澈住在城南。阿澈每日采药。');

  await assert.rejects(
    () => ws.editMany(ref, [
      { field: 'content', old_text: '城南', new_text: '城北' },
      { field: 'content', old_text: '阿澈', new_text: '沈渡' },
    ]),
    /第 2 处：old_text 在 content 中出现 2 次；多带一些上下文使其唯一，或加 replace_all: true/,
  );
  assert.equal(contentOf(ws, ref), '阿澈住在城南。阿澈每日采药。');
  await assert.rejects(() => ws.editMany(ref, []), /edits 必须是非空数组/);
  await assert.rejects(
    () => ws.editMany(ref, Array.from({ length: 21 }, () => ({ field: 'content', old_text: '阿', new_text: '啊' }))),
    /一次最多 20 处替换/,
  );
});

test('edit：逐字找不到时依次放宽匹配，并在回执里说明', async () => {
  const ws = await newWorld('edit-loose');

  const spaced = await newEntry(ws, '第一行  \n第二行\n第三行');
  assert.match(await ws.edit(spaced, 'content', '  第一行\n第二行  ', '开头'), /content：忽略首尾与行尾空白才匹配上/);
  assert.equal(contentOf(ws, spaced), '开头\n第三行');

  const escaped = await newEntry(ws, '他说："走吧。"\n然后离开。');
  assert.match(await ws.edit(escaped, 'content', '他说：\\"走吧。\\"\\n然后', '他说："留下。"\\n然后'), /还原后才匹配上/);
  assert.equal(contentOf(ws, escaped), '他说："留下。"\n然后离开。');

  const punct = await newEntry(ws, '她低声道：“别出声。”');
  assert.match(await ws.edit(punct, 'content', '她低声道:"别出声。"', '她没有说话。'), /忽略全半角标点与引号差异才匹配上/);
  assert.equal(contentOf(ws, punct), '她没有说话。');

  const exact = await newEntry(ws, '逐字一致的原文');
  assert.doesNotMatch(await ws.edit(exact, 'content', '逐字一致', '完全相同'), /才匹配上/);
});

test('edit：放宽后出现多处时不擅自替换；找不到时指出从哪里开始对不上', async () => {
  const ws = await newWorld('edit-miss');
  const ref = await newEntry(ws, '城南的黑市只在子时开张，持影笺者方可入内。“影笺”。“影笺”。');

  await assert.rejects(() => ws.edit(ref, 'content', '"影笺"', '凭证'), /出现 2 次/);
  await assert.rejects(
    () => ws.edit(ref, 'content', '城南的黑市只在子时开张，持令牌者方可入内', 'x'),
    /content 中找不到 old_text：old_text 的前 13 个字符能对上，之后原文是 "影笺者方可入内.*而 old_text 是 "令牌者方可入内"；先 read/,
  );
  await assert.rejects(() => ws.edit(ref, 'content', '完全无关的句子', 'x'), /content 中找不到 old_text；先 read/);
});

test('edit：原文用 CRLF 换行时照常匹配，写回保持 CRLF', async () => {
  const ws = await newWorld('edit-crlf');
  const ref = await newEntry(ws, '第一行\r\n第二行\r\n第三行');
  await ws.edit(ref, 'content', '第一行\n第二行', '甲\n乙');
  assert.equal(contentOf(ws, ref), '甲\r\n乙\r\n第三行');
});

test('edit：空字段提示改用 update，字段名不对时列出可替换字段，CSS 片段的 css 即 content', async () => {
  const ws = await newWorld('edit-fields');
  const entry = await newEntry(ws, '正文');
  await assert.rejects(() => ws.edit(entry, 'description', 'a', 'b'), /的 description 目前为空，请用 update 直接写入/);
  await assert.rejects(() => ws.edit(entry, 'body', 'a', 'b'), /没有文本字段 body；可替换的字段：title、description、content/);

  const css = refOf(await ws.create('css', { name: '片段', content: '.x { color: red; }' }), 'css');
  await ws.edit(css, 'css', 'red', 'blue');
  assert.equal(JSON.parse(ws.read(css)).content, '.x { color: blue; }');

  await ws.create('field', { target: 'persona', label: '心情', type: 'text', update_instruction: '按对话推断心情' });
  await ws.edit('field:persona.心情', 'update_instruction', '心情', '情绪');
  assert.equal(JSON.parse(ws.read('field:persona.心情')).update_instruction, '按对话推断情绪');

  const char = refOf(await ws.create('character', { name: '沈渡', profile: { 出身: '江南药商之家' } }), 'character');
  await ws.edit(char, 'profile.出身', '药商', '盐商');
  assert.equal(JSON.parse(ws.read(char)).profile.出身, '江南盐商之家');
});

test('工具层：edit 的单处写法与 edits 写法都走同一路径', async () => {
  const ws = await newWorld('edit-tools');
  const ref = await newEntry(ws, '阿澈住在城南。');
  const tools = Object.fromEntries(buildTools(ws).map((t) => [t.function.name, t]));

  assert.match(await tools.edit.execute({ ref, field: 'content', old_text: '城南', new_text: '城北' }), /已更新/);
  assert.match(await tools.edit.execute({ ref, edits: [{ field: 'content', old_text: '阿澈', new_text: '沈渡' }] }), /已更新/);
  assert.equal(contentOf(ws, ref), '沈渡住在城北。');
  assert.deepEqual(tools.edit.describe({ ref, field: 'content' }), { summary: `${ref} content`, target: 'entry' });
  const res = await tools.edit.execute({ ref, field: 'content', old_text: '不存在', new_text: 'x' });
  assert.equal(res.success, false);
  assert.match(res.error, /找不到 old_text/);
});
