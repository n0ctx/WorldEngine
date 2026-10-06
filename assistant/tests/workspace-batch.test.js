import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport } from '../../backend/tests/helpers/test-env.js';

const sandbox = createTestSandbox('assistant-workspace-batch');
sandbox.setEnv();

const { createWorkspace } = await freshImport('assistant/server/workspace/index.js');
const { buildTools } = await freshImport('assistant/server/tools/index.js');

after(() => sandbox.cleanup());

const refsOf = (message, kind) => message.match(new RegExp(`${kind}:[\\w.-]+`, 'g')) ?? [];
const toolsOf = (ws) => Object.fromEntries(buildTools(ws).map((t) => [t.function.name, t]));
const count = (table, worldId) => sandbox.db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE world_id = ?`).get(worldId).n;

async function newWorld(name) {
  const ws = createWorkspace({});
  await ws.create('world', { name, profile: { 时间: '1024-03-05' } });
  return ws;
}

test('create items：一次建字段、条目、玩家卡、角色卡，条目条件与卡片 state 可引用同批新建的字段', async () => {
  const ws = await newWorld('batch-create');
  const worldId = ws.session.worldId;
  const receipt = await ws.createMany([
    { kind: 'character', data: { name: '沈渡', state: { 好感度: 40 } } },
    { kind: 'entry', data: { title: '濒死', content: '呼吸微弱。', conditions: [{ field: '玩家.生命', op: '<', value: 30 }] } },
    { kind: 'field', data: { target: 'persona', label: '生命', type: 'number', min: 0, max: 100, default: 100 } },
    { kind: 'field', data: { target: 'character', label: '好感度', type: 'number' } },
    { kind: 'persona', data: { name: '旅人', state: { 生命: 80 } } },
  ]);

  assert.match(receipt, /^已创建 5 项：/);
  const [charRef] = refsOf(receipt, 'character');
  const [entryRef] = refsOf(receipt, 'entry');
  assert.ok(receipt.indexOf(charRef) < receipt.indexOf(entryRef), '回执按传入顺序列出');
  assert.equal(JSON.parse(ws.read(charRef)).state.好感度, 40);
  assert.equal(JSON.parse(ws.read('persona')).state.生命, 80);
  const entry = JSON.parse(ws.read(entryRef));
  assert.equal(entry.trigger, 'state');
  assert.equal(entry.conditions[0].field, '玩家.生命');
  assert.equal(count('personas', worldId), 1, '新世界自带的空白玩家卡被直接填写');
});

test('create items：有一项不合格时整批不写，并指出是第几项', async () => {
  const ws = await newWorld('batch-reject');
  const worldId = ws.session.worldId;
  const before = count('world_prompt_entries', worldId);

  await assert.rejects(
    () => ws.createMany([
      { kind: 'entry', data: { title: '合格条目', content: '正文' } },
      { kind: 'entry', data: { title: '缺正文' } },
      { kind: 'field', data: { target: 'persona', label: '体力', type: 'integer' } },
    ]),
    (err) => {
      assert.match(err.message, /^整批未写入（共 3 项，2 项有问题）/);
      assert.match(err.message, /第 2 项 entry「缺正文」：缺少 content/);
      assert.match(err.message, /第 3 项 field「体力」：type 只能是/);
      return true;
    },
  );
  assert.equal(count('world_prompt_entries', worldId), before);
  assert.throws(() => ws.read('field:persona.体力'), /没有字段/);
});

test('create items：world 必须单独创建，项数超过上限被拒', async () => {
  const ws = await newWorld('batch-limits');
  await assert.rejects(
    () => ws.createMany([{ kind: 'world', data: { name: 'w2', profile: { 时间: '1024-03-05' } } }, { kind: 'entry', data: { title: 'a', content: 'b' } }]),
    /world 需要单独创建/,
  );
  const many = Array.from({ length: 21 }, (_, i) => ({ kind: 'entry', data: { title: `条目${i}`, content: '正文' } }));
  await assert.rejects(() => ws.createMany(many), /一次最多 20 项，收到 21 项/);
  await assert.rejects(() => ws.createMany([]), /不能为空数组/);
  await assert.rejects(() => ws.createMany('entry'), /必须是数组/);
});

test('同一批新建两张玩家卡：只有第一张填写自带的空白卡', async () => {
  const ws = await newWorld('batch-personas');
  const receipt = await ws.createMany([{ kind: 'persona', data: { name: '甲' } }, { kind: 'persona', data: { name: '乙' } }]);
  const refs = refsOf(receipt, 'persona');
  assert.equal(new Set(refs).size, 2);
  assert.equal(count('personas', ws.session.worldId), 2);
});

test('update / set_state / delete 批量：整批校验后逐项写入', async () => {
  const ws = await newWorld('batch-update');
  await ws.createMany([
    { kind: 'field', data: { target: 'character', label: '好感度', type: 'number', min: 0, max: 100 } },
    { kind: 'entry', data: { title: '甲', content: '甲的正文' } },
    { kind: 'entry', data: { title: '乙', content: '乙的正文' } },
    { kind: 'character', data: { name: '沈渡' } },
    { kind: 'character', data: { name: '闻雪' } },
  ]);
  const [e1, e2] = JSON.parse(ws.read('entries')).map((e) => e.ref);
  const [c1, c2] = ws.read('characters').match(/character:[\w-]+/g);

  const updated = await ws.updateMany([
    { ref: e1, data: { description: '改过' } },
    { ref: c1, data: { description: '医师' } },
  ]);
  assert.match(updated, /^已更新 2 项：/);
  assert.equal(JSON.parse(ws.read(e1)).description, '改过');
  assert.equal(JSON.parse(ws.read(c1)).description, '医师');

  await assert.rejects(
    () => ws.updateMany([{ ref: e1, data: { description: '不该写入' } }, { ref: 'entry:missing', data: { title: 'x' } }]),
    /整批未写入（共 2 项，1 项有问题）：第 2 项 entry:missing：条目 entry:missing 不存在/,
  );
  assert.equal(JSON.parse(ws.read(e1)).description, '改过');

  assert.match(await ws.setStateMany([{ ref: c1, values: { 好感度: 10 } }, { ref: c2, values: { 好感度: 20 } }]), /^已更新 2 项/);
  assert.equal(JSON.parse(ws.read(c2)).state.好感度, 20);
  await assert.rejects(
    () => ws.setStateMany([{ ref: c1, values: { 好感度: 30 } }, { ref: e1, values: { 好感度: 1 } }]),
    /第 2 项 entry:[\w-]+：set_state 只用于/,
  );
  assert.equal(JSON.parse(ws.read(c1)).state.好感度, 10);

  await assert.rejects(() => ws.removeMany([e1, 'entry:missing']), /整批未写入/);
  assert.match(await ws.removeMany([e1, e2, c2]), /^已删除 3 项：/);
  assert.deepEqual(JSON.parse(ws.read('entries')), []);
});

test('落库中途出错：逐项报告已写入与未写入，工具层标记 partial', async () => {
  const ws = await newWorld('batch-partial');
  await ws.createMany([
    { kind: 'entry', data: { title: '甲', content: '甲' } },
    { kind: 'entry', data: { title: '乙', content: '乙' } },
    { kind: 'entry', data: { title: '丙', content: '丙' } },
  ]);
  const [e1, e2, e3] = JSON.parse(ws.read('entries')).map((e) => e.ref);
  // 校验通过之后、落库之前，第二项被别处删掉：模拟落库中途的意外失败
  sandbox.db.exec(`CREATE TRIGGER fail_second BEFORE DELETE ON world_prompt_entries WHEN OLD.id = '${e2.slice(6)}' BEGIN SELECT RAISE(ABORT, '磁盘写入失败'); END`);
  try {
    const res = await toolsOf(ws).delete.execute({ refs: [e1, e2, e3] });
    assert.equal(res.success, false);
    assert.equal(res.partial, true);
    assert.match(res.error, /^部分完成（已写入 1 项，未写入 2 项）。已写入：entry:/);
    assert.match(res.error, /第 2 项 entry:[\w-]+ — .*磁盘写入失败；第 3 项 entry:[\w-]+ — 未执行/);
    assert.match(res.error, /先 read 核对，不要整批重发/);
  } finally {
    sandbox.db.exec('DROP TRIGGER fail_second');
  }
  assert.deepEqual(JSON.parse(ws.read('entries')).map((e) => e.ref), [e2, e3]);
});

test('工具层：items / refs 走批量，describe 汇总资源类型；字段误放顶层与 JSON 文本的 data 都能用', async () => {
  const ws = await newWorld('batch-tools');
  const tools = toolsOf(ws);
  const items = [
    { kind: 'entry', data: { title: '甲', content: '甲' } },
    { kind: 'entry', data: { title: '乙', content: '乙' } },
    { kind: 'field', data: { target: 'world', label: '潮位', type: 'text' } },
  ];
  assert.deepEqual(tools.create.describe({ items }), { summary: 'entry×2 field×1', target: 'entry', targets: ['entry', 'field'] });
  assert.match(await tools.create.execute({ items }), /^已创建 3 项/);

  assert.match(await tools.create.execute({ kind: 'entry', title: '顶层字段', content: '正文' }), /已创建 entry:/);
  assert.match(await tools.create.execute({ kind: 'entry', data: JSON.stringify({ title: 'JSON 文本', content: '正文' }) }), /已创建 entry:/);

  const refs = JSON.parse(ws.read('entries')).map((e) => e.ref);
  assert.deepEqual(tools.delete.describe({ refs }).targets, ['entry']);
  assert.match(await tools.delete.execute({ refs }), /^已删除 4 项/);
});
