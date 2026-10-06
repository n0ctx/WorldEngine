import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport } from '../../backend/tests/helpers/test-env.js';

const sandbox = createTestSandbox('assistant-workspace-read-find');
sandbox.setEnv();

const { createWorkspace } = await freshImport('assistant/server/workspace/index.js');
const { buildTools } = await freshImport('assistant/server/tools/index.js');

after(() => sandbox.cleanup());

const refsOf = (message, kind) => message.match(new RegExp(`${kind}:[\\w.-]+`, 'g')) ?? [];

async function newWorld(name, description) {
  const ws = createWorkspace({});
  await ws.create('world', { name, description, profile: { 时间: '1024-03-05' } });
  return ws;
}

test('read refs：一次读多个，按 ref 分段；读不到的写在自己的段里，全部读不到才失败', async () => {
  const ws = await newWorld('read-many');
  const receipt = await ws.createMany([
    { kind: 'entry', data: { title: '黑市', content: '城南的黑市只在子时开张。' } },
    { kind: 'character', data: { name: '沈渡', description: '医师' } },
  ]);
  const [entry] = refsOf(receipt, 'entry');
  const [character] = refsOf(receipt, 'character');

  const out = ws.readMany([entry, 'entry:missing', character]);
  const sections = out.split('\n\n');
  assert.equal(sections.length, 3);
  assert.match(sections[0], new RegExp(`^=== ${entry} ===\\n`));
  assert.equal(JSON.parse(sections[0].split('\n').slice(1).join('\n')).content, '城南的黑市只在子时开张。');
  assert.match(sections[1], /^=== entry:missing ===\n读取失败：条目 entry:missing 不存在/);
  assert.match(sections[2], /沈渡/);

  assert.throws(() => ws.readMany(['entry:a', 'entry:b']), /entry:a：条目 entry:a 不存在.*entry:b：/);
  assert.throws(() => ws.readMany([]), /refs 必须是非空数组/);
  assert.throws(() => ws.readMany(Array.from({ length: 21 }, () => 'world')), /一次最多读 20 个/);
});

test('read 列表：full 带上完整内容，filter 只保留包含关键词的项', async () => {
  const ws = await newWorld('read-list');
  await ws.createMany([
    { kind: 'entry', data: { title: '黑市', content: '城南的黑市只在子时开张。' } },
    { kind: 'entry', data: { title: '官道', content: '官道每十里一处驿站。' } },
    { kind: 'character', data: { name: '沈渡', system_prompt: '沈渡是一名医师。' } },
  ]);

  const brief = JSON.parse(ws.read('entries'));
  assert.equal(brief[0].content, undefined);
  const full = JSON.parse(ws.read('entries', { full: true }));
  assert.deepEqual(full.map((e) => e.content), ['城南的黑市只在子时开张。', '官道每十里一处驿站。']);
  assert.deepEqual(JSON.parse(ws.read('entries', { full: true, filter: '驿站' })).map((e) => e.title), ['官道']);
  assert.deepEqual(JSON.parse(ws.read('entries', { filter: '黑市' })).map((e) => e.title), ['黑市']);
  assert.equal(JSON.parse(ws.read('characters', { full: true }))[0].system_prompt, '沈渡是一名医师。');
  assert.deepEqual(Object.keys(JSON.parse(ws.read('fields', { filter: '不存在的字段名' }))), ['world', 'persona', 'character']);
});

test('read：超过上限时截断并给出续读位置，多目标读取列出没读到的 ref', async () => {
  const ws = await newWorld('read-limit');
  const long = '甲'.repeat(40_000);
  const receipt = await ws.createMany([
    { kind: 'css', data: { name: '长片段', content: `.a { content: "${long}"; }` } },
    { kind: 'entry', data: { title: '长条目', content: long } },
  ]);
  const [css] = refsOf(receipt, 'css');
  const [entry] = refsOf(receipt, 'entry');

  const first = ws.read(css);
  assert.match(first, new RegExp(`（已截断：共 \\d+ 字符，本次 0-30000；继续读 read\\(\\{ ref: "${css}", offset: 30000 \\}\\)）$`));
  const second = ws.read(css, { offset: 30_000 });
  assert.match(second, /本次 30000-\d+；已到末尾）$/);
  assert.throws(() => ws.read(css, { offset: 9_999_999 }), /offset 9999999 超出内容长度/);

  const many = ws.readMany([css, entry, 'world']);
  assert.match(many, new RegExp(`以下 2 个未读取：${entry}、world；请分批 read`));
});

test('find：结果带命中字段与次数，可按类型过滤、指定世界、翻页', async () => {
  const ws = await newWorld('find-a', '影笺流通的世界');
  await ws.createMany([
    { kind: 'entry', data: { title: '影笺', content: '影笺是黑市的凭证。持影笺者可入内。', keywords: ['影笺'] } },
    { kind: 'character', data: { name: '沈渡', system_prompt: '沈渡随身带着一张影笺。', profile: { 职业: '影笺贩子' } } },
  ]);
  const other = await newWorld('find-b');
  await other.create('entry', { title: '别处的影笺', content: '这里也有影笺。' });

  const all = ws.find('影笺');
  assert.match(all, /world:[\w-]+ find-a \[description\]/);
  assert.match(all, /entry:[\w-]+ 影笺 \[title, keywords, content×2\]：/);
  assert.match(all, /character:[\w-]+ 沈渡 \[system_prompt, profile\]/);
  assert.doesNotMatch(all, /别处的影笺/);

  assert.deepEqual(ws.find('影笺', { kinds: ['character'] }).split('\n').length, 1);
  assert.throws(() => ws.find('影笺', { kinds: ['entries'] }), /kinds 只能包含/);
  assert.match(ws.find('影笺', { world: other.session.worldId }), /别处的影笺/);
  assert.throws(() => ws.find('影笺', { world: 'no-such-world' }), /世界 no-such-world 不存在/);

  const everywhere = ws.find('影笺', { world: 'all', kinds: ['entry'] });
  assert.match(everywhere, /别处的影笺.*（世界：find-b）/);
  assert.match(everywhere, /（世界：find-a）/);

  const kinds = ['world', 'entry', 'character'];
  assert.match(ws.find('影笺', { kinds, limit: 2 }), /（共 3 条，显示 1-2；下一页加 offset: 2/);
  assert.match(ws.find('影笺', { kinds, limit: 2, offset: 2 }), /（共 3 条，显示 3-3）$/);
  assert.match(ws.find('查无此词'), /没有找到包含 "查无此词" 的内容/);
});

test('工具层：read 的 refs / full / filter / offset 与 find 的 kinds 透传', async () => {
  const ws = await newWorld('read-tools');
  await ws.create('entry', { title: '黑市', content: '城南的黑市。' });
  const tools = Object.fromEntries(buildTools(ws).map((t) => [t.function.name, t]));

  assert.match(await tools.read.execute({ refs: ['world', 'entries'] }), /^=== world ===[\s\S]+=== entries ===/);
  assert.deepEqual(tools.read.describe({ refs: ['entry:a', 'entry:b', 'world'] }), { summary: 'entry×2 world×1' });
  assert.equal(JSON.parse(await tools.read.execute({ ref: 'entries', full: true }))[0].content, '城南的黑市。');
  assert.deepEqual(JSON.parse(await tools.read.execute({ ref: 'entries', filter: '查无' })), []);
  assert.doesNotMatch(await tools.find.execute({ query: '黑市', kinds: ['character'] }), /entry:/);
});
