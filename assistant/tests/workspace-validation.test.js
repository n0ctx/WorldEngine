import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport } from '../../backend/tests/helpers/test-env.js';

const sandbox = createTestSandbox('assistant-workspace-validation');
sandbox.setEnv();

const { createWorkspace } = await freshImport('assistant/server/workspace/index.js');
const { buildTools } = await freshImport('assistant/server/tools/index.js');

after(() => sandbox.cleanup());

const refOf = (message, kind) => message.match(new RegExp(`${kind}:[\\w.-]+`))[0];
const count = (table, worldId) => sandbox.db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE world_id = ?`).get(worldId).n;

async function newWorld(name) {
  const ws = createWorkspace({});
  await ws.create('world', { name, profile: { 时间: '1024-03-05' } });
  return ws;
}

test('entry：关键词写成一段文本会拆成列表，类型不对的值报错而不是静默改写', async () => {
  const ws = await newWorld('validate-entry');
  const ref = refOf(await ws.create('entry', { title: '黑市', content: '暗号。', keywords: '黑市，暗号、影笺', keyword_logic: 'and' }), 'entry');
  const view = JSON.parse(ws.read(ref));
  assert.equal(view.trigger, 'keyword');
  assert.deepEqual(view.keywords, ['黑市', '暗号', '影笺']);
  assert.equal(view.keyword_logic, 'AND');

  await assert.rejects(() => ws.create('entry', { title: 'a', content: 'b', keywords: { 0: '黑市' } }), /keywords 需要文本数组/);
  await assert.rejects(() => ws.create('entry', { title: 'a', content: 'b', token: 'many' }), /token 需要数字/);
  await assert.rejects(() => ws.create('entry', { title: 'a', content: 'b', keyword_logic: 'XOR' }), /keyword_logic 只能是 AND \/ OR/);
  await assert.rejects(() => ws.create('entry', { title: 'a', content: { text: 'b' } }), /content 需要文本，收到对象/);
});

test('entry：条件可写成单个对象，运算符不合法时列出可用运算符，报错不带内部字段名', async () => {
  const ws = await newWorld('validate-conditions');
  await ws.create('field', { target: 'persona', label: '生命', type: 'number' });
  const ref = refOf(await ws.create('entry', { title: '濒死', content: '…', conditions: { field: '玩家.生命', op: '<', value: 30 } }), 'entry');
  assert.equal(JSON.parse(ws.read(ref)).conditions.length, 1);

  await assert.rejects(
    () => ws.create('entry', { title: 'a', content: 'b', conditions: [{ field: '玩家.生命', op: '≈', value: 1 }] }),
    /条件运算符 "≈" 不支持，可用：.*>=/,
  );
  await assert.rejects(() => ws.create('entry', { title: 'a', content: 'b', conditions: ['生命<30'] }), /每项需要 \{ field, op, value \}/);

  const tools = Object.fromEntries(buildTools(ws).map((t) => [t.function.name, t]));
  const res = await tools.create.execute({ kind: 'field', data: { target: 'persona', label: '背包', type: 'table' } });
  assert.equal(res.success, false);
  assert.match(res.error, /columns/);
  assert.doesNotMatch(res.error, /table_columns|stateFieldOps/);
});

test('entry：enabled 与 order 可读写', async () => {
  const ws = await newWorld('validate-order');
  const a = refOf(await ws.create('entry', { title: '甲', content: '甲' }), 'entry');
  const b = refOf(await ws.create('entry', { title: '乙', content: '乙', enabled: 'false' }), 'entry');
  const c = refOf(await ws.create('entry', { title: '丙', content: '丙', order: 1 }), 'entry');

  assert.deepEqual(JSON.parse(ws.read('entries')).map((e) => e.ref), [c, a, b]);
  assert.equal(JSON.parse(ws.read(b)).enabled, false);
  assert.equal(JSON.parse(ws.read(a)).enabled, undefined);
  assert.equal(JSON.parse(ws.read(a)).order, 2);

  await ws.update(b, { enabled: true, order: 1 });
  assert.deepEqual(JSON.parse(ws.read('entries')).map((e) => e.ref), [b, c, a]);
  assert.equal(JSON.parse(ws.read(b)).enabled, undefined);
  await assert.rejects(() => ws.update(a, { enabled: 'maybe' }), /enabled 需要 true 或 false/);
  await assert.rejects(() => ws.update(a, { order: 0 }), /order 需要不小于 1 的整数/);
});

test('列表字段：{ add, remove } 增删单项，数组仍是整体替换', async () => {
  const ws = await newWorld('validate-list-patch');
  await ws.createMany([
    { kind: 'field', data: { target: 'persona', label: '生命', type: 'number' } },
    { kind: 'field', data: { target: 'persona', label: '阵营', type: 'enum', options: ['官府', '江湖'] } },
    { kind: 'field', data: { target: 'character', label: '随身物', type: 'list' } },
  ]);
  const entry = refOf(await ws.create('entry', { title: '黑市', content: '…', keywords: ['黑市', '暗号'] }), 'entry');

  await ws.update(entry, { keywords: { add: ['影笺', '黑市'], remove: ['暗号'] } });
  assert.deepEqual(JSON.parse(ws.read(entry)).keywords, ['黑市', '影笺']);
  await assert.rejects(() => ws.update(entry, { keywords: { remove: ['不存在'] } }), /keywords 里没有 "不存在"，当前值：\["黑市","影笺"\]/);
  await assert.rejects(() => ws.update(entry, { keywords: { add: '影笺' } }), /keywords\.add 必须是数组/);

  await ws.update(entry, { conditions: { add: [{ field: '玩家.生命', op: '<', value: 30 }, { field: '玩家.生命', op: '>', value: 0 }] } });
  assert.equal(JSON.parse(ws.read(entry)).trigger, 'state');
  await ws.update(entry, { conditions: { remove: [{ field: '玩家.生命', op: '>' }] } });
  assert.deepEqual(JSON.parse(ws.read(entry)).conditions.map((c) => c.op), ['<']);

  await ws.update('field:persona.阵营', { options: { add: ['中立'], remove: ['官府'] } });
  assert.deepEqual(JSON.parse(ws.read('field:persona.阵营')).options, ['江湖', '中立']);

  const char = refOf(await ws.create('character', { name: '沈渡', profile: { 核心性格: ['冷静'] }, state: { 随身物: ['药箱'] } }), 'character');
  await ws.update(char, { profile: { 核心性格: { add: ['多疑'] } } });
  await ws.setState(char, { 随身物: { add: ['银针'], remove: ['药箱'] } });
  const view = JSON.parse(ws.read(char));
  assert.deepEqual(view.profile.核心性格, ['冷静', '多疑']);
  assert.deepEqual(view.state.随身物, ['银针']);
});

test('field：开关与数值写成文本也按原意处理，自定 key 冲突报错而不是假成功，保留名给出去处', async () => {
  const ws = await newWorld('validate-field');
  await ws.create('field', { target: 'character', label: '好感度', type: 'number', key: 'affinity', min: '0', max: '100', allow_empty: 'false', nearby: 0 });
  const view = JSON.parse(ws.read('field:character.affinity'));
  assert.deepEqual([view.min, view.max, view.allow_empty, view.nearby], [0, 100, false, false]);

  await assert.rejects(
    () => ws.create('field', { target: 'character', label: '亲密度', type: 'number', key: 'affinity' }),
    /character 层已有 key 为 affinity_char 的字段（好感度）/,
  );
  assert.throws(() => ws.read('field:character.亲密度'), /没有字段/);
  await assert.rejects(() => ws.create('field', { target: 'character', label: '怒气', type: 'number', min: 'low' }), /min 需要数字/);
  await assert.rejects(() => ws.create('field', { target: 'persona', label: '阵营', type: 'enum', options: { a: 1 } }), /options 需要文本数组/);
  await assert.rejects(() => ws.create('field', { target: 'world', label: '时间', type: 'datetime' }), /由世界档案管理.*update world 的 profile/);
});

test('卡片与世界：档案写错时其余字段不落库；文本字段不接受对象；世界数值不合法时报错', async () => {
  const ws = await newWorld('validate-cards');
  const char = refOf(await ws.create('character', { name: '沈渡', description: '医师' }), 'character');

  await assert.rejects(() => ws.update(char, { description: '不该写入', profile: { 不存在的档案: 'x' } }), /没有档案字段 "不存在的档案"/);
  assert.equal(JSON.parse(ws.read(char)).description, '医师');
  await assert.rejects(() => ws.update(char, { system_prompt: { text: '人设' } }), /system_prompt 需要文本，收到对象/);

  await assert.rejects(() => ws.update('persona', { description: '不该写入', profile: { 不存在的档案: 'x' } }), /没有档案字段/);
  assert.equal(JSON.parse(ws.read('persona')).description, undefined);

  await assert.rejects(() => ws.update('world', { description: '不该写入', profile: { 时间: '明天' } }), /时间格式无效/);
  assert.equal(JSON.parse(ws.read('world')).description, undefined);
  await assert.rejects(() => ws.update('world', { temperature: 'hot' }), /temperature 需要数字/);
  await assert.rejects(() => ws.update('world', { max_tokens: 1.5 }), /max_tokens 需要整数/);
});

test('样式：enabled / world_only 写成文本按原意处理，改规则时认 ref 上的 @世界', async () => {
  const ws = await newWorld('validate-style');
  const other = await newWorld('validate-style-other');
  const css = refOf(await ws.create('css', { name: '片段', content: '.x { color: red; }', enabled: 'false' }), 'css');
  assert.equal(JSON.parse(ws.read(css)).enabled, false);

  const regex = refOf(await ws.create('regex', { name: '规则', pattern: 'foo', world_only: 'false' }), 'regex');
  assert.equal(JSON.parse(ws.read(regex)).world, '全局');
  await ws.update(`${regex}@${other.session.worldId}`, { world_only: true });
  assert.equal(JSON.parse(ws.read(regex)).world, `world:${other.session.worldId}`);
  await assert.rejects(() => ws.update(regex, { enabled: 'on' }), /enabled 需要 true 或 false/);
});

test('玩家卡：可以删除多余的卡，最后一张不能删；读取不会顺带建卡；指定的世界不存在时报错', async () => {
  const ws = await newWorld('validate-persona');
  const worldId = ws.session.worldId;
  const first = refOf(await ws.create('persona', { name: '甲' }), 'persona');
  const second = refOf(await ws.create('persona', { name: '乙' }), 'persona');
  assert.equal(count('personas', worldId), 2);

  const receipt = await ws.remove(second);
  assert.match(receipt, new RegExp(`已删除 ${second}（乙）；当前玩家卡是 ${first}（甲）`));
  await assert.rejects(() => ws.remove(first), /至少保留一张玩家卡/);

  sandbox.db.prepare('DELETE FROM personas WHERE world_id = ?').run(worldId);
  ws.read('world');
  ws.read('personas');
  ws.find('甲');
  assert.throws(() => ws.read('persona'), /还没有玩家卡/);
  assert.equal(count('personas', worldId), 0);

  assert.throws(() => ws.read('entries@no-such-world'), /世界 no-such-world 不存在/);
  await assert.rejects(() => ws.create('entry', { title: 'a', content: 'b' }, 'no-such-world'), /世界 no-such-world 不存在/);
});
