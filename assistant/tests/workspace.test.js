import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport } from '../../backend/tests/helpers/test-env.js';
import { insertCharacter, insertWorld } from '../../backend/tests/helpers/fixtures.js';

const sandbox = createTestSandbox('assistant-workspace');
sandbox.setEnv();

const { createWorkspace } = await freshImport('assistant/server/workspace/index.js');
const { buildTools } = await freshImport('assistant/server/tools/index.js');

after(() => sandbox.cleanup());

const refOf = (message, kind) => message.match(new RegExp(`${kind}:[\\w.-]+`))[0];

test('create world 切换当前世界，后续资源默认建在新世界', async () => {
  const ws = createWorkspace({});
  const msg = await ws.create('world', { name: '雾港', description: '蒸汽与潮汐的港城' });
  const worldRef = refOf(msg, 'world');
  assert.equal(ws.session.worldId, worldRef.slice('world:'.length));

  const view = JSON.parse(ws.read('world'));
  assert.equal(view.name, '雾港');
  assert.ok(view.fields.persona.some((line) => line.includes('性格')), '新世界自带默认字段');
});

test('entry：按 keywords / conditions 推断触发类型，条件字段必须存在', async () => {
  const world = insertWorld(sandbox.db, { name: 'entry-world' });
  const ws = createWorkspace({ worldId: world.id });

  const keywordRef = refOf(await ws.create('entry', { title: '黑市', content: '暗号……', keywords: ['影笺'] }), 'entry');
  assert.equal(JSON.parse(ws.read(keywordRef)).trigger, 'keyword');

  await assert.rejects(
    () => ws.create('entry', { title: '重伤', content: 'x', conditions: [{ field: '玩家.生命', op: '<', value: 30 }] }),
    /条件字段 "玩家.生命" 不存在/,
  );

  await ws.create('field', { target: 'persona', label: '生命', type: 'number', default: 100, min: 0, max: 100 });
  const stateRef = refOf(await ws.create('entry', {
    title: '重伤', content: 'x', conditions: [{ field: '玩家.生命', op: '<', value: 30 }], condition_logic: 'OR',
  }), 'entry');
  const stateView = JSON.parse(ws.read(stateRef));
  assert.equal(stateView.trigger, 'state');
  assert.equal(stateView.condition_logic, 'OR');
  assert.deepEqual(stateView.conditions, [{ field: '玩家.生命', op: '<', value: '30' }]);

  await assert.rejects(() => ws.create('entry', { title: 'x', content: 'y', trigger: 'llm' }), /需要 description/);
  await assert.rejects(() => ws.create('entry', { title: 'x', content: 'y', position: 'top' }), /不支持字段 position/);
});

test('entry update：给常驻条目补关键词时自动切换为 keyword', async () => {
  const world = insertWorld(sandbox.db, { name: 'entry-update-world' });
  const ws = createWorkspace({ worldId: world.id });
  const ref = refOf(await ws.create('entry', { title: '王都', content: '王都概况' }), 'entry');
  assert.equal(JSON.parse(ws.read(ref)).trigger, 'always');
  await ws.update(ref, { keywords: ['王都', '白塔'] });
  const view = JSON.parse(ws.read(ref));
  assert.equal(view.trigger, 'keyword');
  assert.deepEqual(view.keywords, ['王都', '白塔']);
});

test('field：生成 key、默认值按类型转换、同名拒绝、update_instruction 决定自动更新', async () => {
  const world = insertWorld(sandbox.db, { name: 'field-world' });
  const ws = createWorkspace({ worldId: world.id });

  const msg = await ws.create('field', { target: 'persona', label: 'Gold Coins', type: 'number', default: 5 });
  assert.match(msg, /field:persona\.gold_coins_user/);
  const listRef = refOf(await ws.create('field', {
    target: 'character', label: '背包', type: 'list', default: ['短刀'], update_instruction: '获得或失去物品时更新',
  }), 'field');
  const listView = JSON.parse(ws.read('field:character.背包'));
  assert.deepEqual(listView.default, ['短刀']);
  assert.equal(listView.update_instruction, '获得或失去物品时更新');
  assert.ok(listRef.startsWith('field:character.'));

  await assert.rejects(() => ws.create('field', { target: 'persona', label: 'Gold Coins', type: 'text' }), /已有同名字段/);
  await assert.rejects(
    () => ws.create('field', { target: 'world', label: '阶段', type: 'enum', options: ['序章', '决战'], default: '终章' }),
    /不符合字段类型 enum/,
  );

  await ws.update('field:persona.gold_coins', { default: 20 });
  assert.equal(JSON.parse(ws.read('field:persona.Gold Coins')).default, 20);
  await ws.remove('field:persona.gold_coins');
  assert.throws(() => ws.read('field:persona.gold_coins'), /没有字段/);
});

test('character / persona：state 用标签写原生值，类型不符给出可读错误', async () => {
  const ws = createWorkspace({});
  await ws.create('world', { name: 'card-world' });
  await ws.create('field', { target: 'character', label: '好感度', type: 'number', min: 0, max: 100 });

  const charRef = refOf(await ws.create('character', {
    name: '沈渡', system_prompt: '沈渡是一名医师。', state: { 好感度: 40, 性格: ['冷静'] },
  }), 'character');
  const view = JSON.parse(ws.read(charRef));
  assert.equal(view.state.好感度, 40);
  assert.deepEqual(view.state.性格, ['冷静']);

  await ws.setState(charRef, { 好感度: 60 });
  assert.equal(JSON.parse(ws.read(charRef)).state.好感度, 60);
  await assert.rejects(() => ws.setState(charRef, { 好感度: 200 }), /不符合类型 number/);
  await assert.rejects(() => ws.setState(charRef, { 魔力: 1 }), /没有字段 "魔力"。可用字段/);

  const personaMsg = await ws.create('persona', { name: '旅人', state: { 年龄: 20 } });
  const personaRef = refOf(personaMsg, 'persona');
  assert.equal(JSON.parse(ws.read('persona')).ref, personaRef, '新玩家卡成为当前激活玩家卡');
  await ws.update('persona', { description: '远道而来' });
  assert.equal(JSON.parse(ws.read(personaRef)).description, '远道而来');
  await assert.rejects(() => ws.remove(personaRef), /不支持删除/);
});

test('edit：old_text 未找到 / 出现多次 / 唯一匹配', async () => {
  const world = insertWorld(sandbox.db, { name: 'edit-world' });
  const character = insertCharacter(sandbox.db, world.id, { name: '阿青', system_prompt: '她很安静。她很安静。' });
  const ws = createWorkspace({ worldId: world.id });
  const ref = `character:${character.id}`;

  await assert.rejects(() => ws.edit(ref, 'system_prompt', '他', '她'), /找不到 old_text/);
  await assert.rejects(() => ws.edit(ref, 'system_prompt', '她很安静。', '她很吵。'), /出现 2 次/);
  await ws.edit(ref, 'system_prompt', '她很安静。她', '她很安静，但她');
  assert.equal(JSON.parse(ws.read(ref)).system_prompt, '她很安静，但她很安静。');
});

test('style：正则 /…/flags 拆分并校验可编译，主题只能覆写已有 token', async () => {
  const world = insertWorld(sandbox.db, { name: 'style-world' });
  const ws = createWorkspace({ worldId: world.id });

  const regexRef = refOf(await ws.create('regex', { name: '去星号', pattern: '/\\*\\*(.+?)\\*\\*/g', replacement: '$1', world_only: true }), 'regex');
  const regexView = JSON.parse(ws.read(regexRef));
  assert.equal(regexView.pattern, '\\*\\*(.+?)\\*\\*');
  assert.equal(regexView.flags, 'g');
  assert.equal(regexView.world, `world:${world.id}`);
  await assert.rejects(() => ws.create('regex', { name: '坏', pattern: '(' }), /正则无法编译/);

  await assert.rejects(() => ws.create('css', { name: 'x', content: '.a { color: var(--we-not-a-token); }' }), /不存在的 token/);
  await assert.rejects(() => ws.create('theme', { name: 'Dusk', css: '.a { color: red; }' }), /只能包含 :root/);
  await assert.rejects(() => ws.create('theme', { name: 'Dusk', css: ':root { color: red; }' }), /只能覆写 --we-\* 变量/);
  const themeMsg = await ws.create('theme', { name: 'Dusk Harbor', css: ':root { --we-color-accent: #336699; }' });
  assert.match(themeMsg, /theme:dusk-harbor/);
  await ws.edit('theme:dusk-harbor', 'css', '#336699', '#224466');
  assert.match(JSON.parse(ws.read('theme:dusk-harbor')).css, /#224466/);
  await ws.remove('theme:dusk-harbor');
});

test('config：读取隐去密钥，写入密钥字段被拒绝', async () => {
  const ws = createWorkspace({});
  const view = JSON.parse(ws.read('config'));
  assert.equal('provider_keys' in view, false);
  await assert.rejects(() => ws.update('config', { provider_keys: { openai: 'x' } }), /不能修改密钥字段 provider_keys/);
  await ws.update('config', { global_system_prompt: '保持简洁。' });
  assert.equal(JSON.parse(ws.read('config')).global_system_prompt, '保持简洁。');
});

test('find 与 doc：搜索当前世界内容和参考文档', async () => {
  const world = insertWorld(sandbox.db, { name: 'find-world' });
  const ws = createWorkspace({ worldId: world.id });
  await ws.create('entry', { title: '潮汐钟', content: '每逢满月，潮汐钟会自鸣。' });
  assert.match(ws.find('潮汐钟'), /entry:[\w-]+ 潮汐钟/);
  assert.match(ws.read('docs'), /doc:world/);
  assert.match(ws.read('doc:theme-tokens'), /--we-color-accent/);
  assert.throws(() => ws.read('doc:nope'), /不存在/);
});

test('工具层：失败以 { success:false, error } 返回并去掉内部前缀', async () => {
  const ws = createWorkspace({});
  const tools = Object.fromEntries(buildTools(ws).map((t) => [t.function.name, t]));
  const res = await tools.create.execute({ kind: 'entry', data: { title: 'x', content: 'y' } });
  assert.equal(res.success, false);
  assert.match(res.error, /当前没有选中世界/);
  const bad = await tools.read.execute({ ref: 'nonsense' });
  assert.match(bad.error, /无法识别的 ref/);
});

test('persona：新世界只有一张空白玩家卡时直接填写它，不再多建一张', async () => {
  const ws = createWorkspace({});
  await ws.create('world', { name: 'blank-persona-world' });
  const before = JSON.parse(ws.read('personas'));
  assert.equal(before.length, 1);

  const msg = await ws.create('persona', { name: '阿岚', state: { 年龄: 19 } });
  const after = JSON.parse(ws.read('personas'));
  assert.equal(after.length, 1);
  assert.equal(refOf(msg, 'persona'), refOf(before[0], 'persona'));
  assert.equal(JSON.parse(ws.read('persona')).state.年龄, 19);

  await ws.create('persona', { name: '第二位' });
  assert.equal(JSON.parse(ws.read('personas')).length, 2);
});
