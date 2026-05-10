// 补充 normalize-proposal.js 中尚未被 routes.test.js 覆盖的分支
import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport } from '../../backend/tests/helpers/test-env.js';
import { insertWorld, insertCharacter, insertPersona } from '../../backend/tests/helpers/fixtures.js';

const sandbox = createTestSandbox('assistant-normalize-proposal');
sandbox.setEnv();

const routesMod = await freshImport('assistant/server/routes.js');
const np = await freshImport('assistant/server/normalize-proposal.js');
const { __testables } = routesMod;
const { normalizeProposal, applyProposal, normalizeStateFieldOps, normalizeEntryOps } = np;

after(() => sandbox.cleanup());

// ─── 表格字段 ────────────────────────────────────────────────────────────

test('stateFieldOps create type=table 校验 columns / default_value', () => {
  const ok = normalizeStateFieldOps([{
    op: 'create', target: 'character',
    field_key: 'sheet', label: '面板', type: 'table',
    table_columns: [{ key: 'atk', label: '攻击', min: 0, max: 100 }],
    default_value: '{"atk":10}',
  }], 'world-card');
  assert.equal(ok[0].type, 'table');
  assert.equal(ok[0].table_columns[0].key, 'atk');

  // table_columns 必须非空
  assert.throws(() => normalizeStateFieldOps([{
    op: 'create', target: 'world', field_key: 'x', label: 'X', type: 'table',
  }], 'world-card'), /table_columns 必须是非空数组/);

  // 列 key 非法
  assert.throws(() => normalizeStateFieldOps([{
    op: 'create', target: 'world', field_key: 'x', label: 'X', type: 'table',
    table_columns: [{ key: 'bad-key', label: 'B' }],
  }], 'world-card'), /key 不合法/);

  // 列 key 重复
  assert.throws(() => normalizeStateFieldOps([{
    op: 'create', target: 'world', field_key: 'x', label: 'X', type: 'table',
    table_columns: [{ key: 'a', label: 'A' }, { key: 'a', label: 'A2' }],
  }], 'world-card'), /key "a" 重复/);

  // default_value 必须是对象 JSON
  assert.throws(() => normalizeStateFieldOps([{
    op: 'create', target: 'world', field_key: 'x', label: 'X', type: 'table',
    table_columns: [{ key: 'a', label: 'A' }],
    default_value: '"not-an-object"',
  }], 'world-card'), /必须解析为对象/);

  // 未声明列
  assert.throws(() => normalizeStateFieldOps([{
    op: 'create', target: 'world', field_key: 'x', label: 'X', type: 'table',
    table_columns: [{ key: 'a', label: 'A' }],
    default_value: '{"b":1}',
  }], 'world-card'), /包含未声明列/);

  // value 必须是数值
  assert.throws(() => normalizeStateFieldOps([{
    op: 'create', target: 'world', field_key: 'x', label: 'X', type: 'table',
    table_columns: [{ key: 'a', label: 'A' }],
    default_value: '{"a":"x"}',
  }], 'world-card'), /必须是数值/);

  // table_columns 字符串解析
  const okStr = normalizeStateFieldOps([{
    op: 'create', target: 'world', field_key: 'x', label: 'X', type: 'table',
    table_columns: '[{"key":"a","label":"A"}]',
  }], 'world-card');
  assert.equal(okStr[0].table_columns[0].key, 'a');

  // table_columns 字符串解析失败
  assert.throws(() => normalizeStateFieldOps([{
    op: 'create', target: 'world', field_key: 'x', label: 'X', type: 'table',
    table_columns: 'not-json',
  }], 'world-card'), /必须是数组或合法 JSON 字符串/);

  // table_columns 必须是数组
  assert.throws(() => normalizeStateFieldOps([{
    op: 'create', target: 'world', field_key: 'x', label: 'X', type: 'table',
    table_columns: { a: 1 },
  }], 'world-card'), /必须是数组/);

  // table_columns 元素必须是对象
  assert.throws(() => normalizeStateFieldOps([{
    op: 'create', target: 'world', field_key: 'x', label: 'X', type: 'table',
    table_columns: ['x'],
  }], 'world-card'), /必须是对象/);

  // min / max 非数值
  assert.throws(() => normalizeStateFieldOps([{
    op: 'create', target: 'world', field_key: 'x', label: 'X', type: 'table',
    table_columns: [{ key: 'a', label: 'A', min: 'bad' }],
  }], 'world-card'), /min 必须是数值/);

  assert.throws(() => normalizeStateFieldOps([{
    op: 'create', target: 'world', field_key: 'x', label: 'X', type: 'table',
    table_columns: [{ key: 'a', label: 'A', max: 'bad' }],
  }], 'world-card'), /max 必须是数值/);
});

test('stateFieldOps update type=table 与 type 切换约束', () => {
  // update + table 必须 columns 非空
  assert.throws(() => normalizeStateFieldOps([{
    op: 'update', target: 'world', id: 'f1', type: 'table',
  }], 'world-card'), /table_columns 必须是非空数组/);

  // update table 不能填 enum_options
  assert.throws(() => normalizeStateFieldOps([{
    op: 'update', target: 'world', id: 'f1', type: 'table',
    table_columns: [{ key: 'a', label: 'A' }],
    enum_options: ['x'],
  }], 'world-card'), /禁止填写 enum_options/);

  // update table default_value
  const ok = normalizeStateFieldOps([{
    op: 'update', target: 'world', id: 'f1', type: 'table',
    table_columns: [{ key: 'a', label: 'A' }],
    default_value: '{"a":1}',
  }], 'world-card');
  assert.equal(ok[0].id, 'f1');

  // update 非 table 但带 table_columns → 拒绝
  assert.throws(() => normalizeStateFieldOps([{
    op: 'update', target: 'world', id: 'f1', type: 'text',
    table_columns: [{ key: 'a', label: 'A' }],
  }], 'world-card'), /仅 type='table' 时允许使用/);

  // update + datetime + 错误 default_value
  assert.throws(() => normalizeStateFieldOps([{
    op: 'update', target: 'world', id: 'f1', type: 'datetime',
    default_value: '"abc"',
  }], 'world-card'), /不符合 datetime 格式/);
});

test('stateFieldOps nearby_enabled 仅 target=character 可用', () => {
  // create + character + nearby_enabled=0 → 通过，落 0
  const ok0 = normalizeStateFieldOps([{
    op: 'create', target: 'character',
    field_key: 'hp', label: 'HP', type: 'number',
    nearby_enabled: 0,
  }], 'world-card');
  assert.equal(ok0[0].nearby_enabled, 0);

  // create + character + nearby_enabled=true → 落 1
  const ok1 = normalizeStateFieldOps([{
    op: 'create', target: 'character',
    field_key: 'mp', label: 'MP', type: 'number',
    nearby_enabled: true,
  }], 'world-card');
  assert.equal(ok1[0].nearby_enabled, 1);

  // create + character 未提供 → normalized 不带该键，留 DB 默认
  const okMissing = normalizeStateFieldOps([{
    op: 'create', target: 'character',
    field_key: 'sp', label: 'SP', type: 'number',
  }], 'world-card');
  assert.equal('nearby_enabled' in okMissing[0], false);

  // create + target=world + nearby_enabled → 拒绝
  assert.throws(() => normalizeStateFieldOps([{
    op: 'create', target: 'world',
    field_key: 'phase', label: '阶段', type: 'enum', enum_options: ['a'],
    nearby_enabled: 1,
  }], 'world-card'), /nearby_enabled 仅 target='character' 时允许使用/);

  // create + target=persona + nearby_enabled → 拒绝
  assert.throws(() => normalizeStateFieldOps([{
    op: 'create', target: 'persona',
    field_key: 'role', label: '角色', type: 'text',
    nearby_enabled: 0,
  }], 'world-card'), /nearby_enabled 仅 target='character' 时允许使用/);

  // update + character + nearby_enabled 切换
  const okUpd = normalizeStateFieldOps([{
    op: 'update', target: 'character', id: 'f1',
    nearby_enabled: 0,
  }], 'world-card');
  assert.equal(okUpd[0].nearby_enabled, 0);

  // update + target=world + nearby_enabled → 拒绝
  assert.throws(() => normalizeStateFieldOps([{
    op: 'update', target: 'world', id: 'f1',
    nearby_enabled: 1,
  }], 'world-card'), /nearby_enabled 仅 target='character' 时允许使用/);
});

test('stateFieldOps create non-table 不允许 table_columns', () => {
  assert.throws(() => normalizeStateFieldOps([{
    op: 'create', target: 'world', field_key: 'x', label: 'X', type: 'text',
    table_columns: [{ key: 'a', label: 'A' }],
  }], 'world-card'), /仅 type='table' 时允许使用/);
});

test('normalizeEntryOps: keyword 类型缺关键词产生 warning', () => {
  const warnings = [];
  const ops = normalizeEntryOps([
    { op: 'create', title: 'k', content: 'c', trigger_type: 'keyword' },
  ], { allowTriggerType: true, warnings });
  assert.equal(ops[0].trigger_type, 'keyword');
  assert.ok(warnings[0].includes('keyword'));

  // state 类型但 conditions 为空 → warning
  const w2 = [];
  normalizeEntryOps([
    { op: 'create', title: 's', content: 'c', trigger_type: 'state' },
  ], { allowTriggerType: true, warnings: w2 });
  assert.ok(w2[0].includes('state'));
});

test('normalizeEntryOps: 校验各类错误输入', () => {
  assert.throws(() => normalizeEntryOps('not-array'), /必须是数组/);
  assert.throws(() => normalizeEntryOps([null]), /必须是对象/);
  assert.throws(() => normalizeEntryOps([{ op: 'invalid' }]), /\.op 非法/);
  assert.throws(() => normalizeEntryOps([{ op: 'delete' }]), /\.id 缺失/);
  assert.throws(() => normalizeEntryOps([{ op: 'update' }]), /\.id 缺失/);

  // delete 走捷径返回 { op, id }
  const out = normalizeEntryOps([{ op: 'delete', id: 'e1' }]);
  assert.deepEqual(out[0], { op: 'delete', id: 'e1' });

  // 完整字段
  const full = normalizeEntryOps([{
    op: 'create', title: 't', description: 'd', content: 'c',
    keywords: ['a', 'b'], keyword_scope: 'all', token: '5', mode: 'chat',
  }], { includeMode: true });
  assert.equal(full[0].token, 5);
  assert.equal(full[0].mode, 'chat');
  assert.deepEqual(full[0].keywords, ['a', 'b']);

  // token 非法 → 落到 1
  const t = normalizeEntryOps([{ op: 'create', token: 'abc' }]);
  assert.equal(t[0].token, 1);
});

// ─── applyProposal 各种 DB 路径 ──────────────────────────────────────

test('applyProposal world-card delete', async () => {
  const w = insertWorld(sandbox.db, { name: 'np-del-world' });
  const proposal = normalizeProposal({
    type: 'world-card', operation: 'delete', entityId: w.id,
  });
  const r = await applyProposal(proposal);
  assert.equal(r.deleted, w.id);

  // 缺 entityId
  await assert.rejects(() => applyProposal({ type: 'world-card', operation: 'delete' }), /需要 entityId/);
});

test('applyProposal world-card update with entryOps update / delete', async () => {
  const w = insertWorld(sandbox.db, { name: 'np-upd-world' });
  // 先建一条 entry
  const c1 = await applyProposal(normalizeProposal({
    type: 'world-card', operation: 'update', entityId: w.id,
    entryOps: [{ op: 'create', title: 'e1', content: 'x', trigger_type: 'always' }],
  }));
  const eid = sandbox.db.prepare('SELECT id FROM world_prompt_entries WHERE world_id=? AND title=?').get(w.id, 'e1').id;
  // update + delete 同一轮
  await applyProposal(normalizeProposal({
    type: 'world-card', operation: 'update', entityId: w.id,
    entryOps: [
      { op: 'update', id: eid, title: 'e1-改', content: 'x' },
      { op: 'delete', id: 'no-such-entry' },
    ],
  }));
  const updated = sandbox.db.prepare('SELECT title FROM world_prompt_entries WHERE id=?').get(eid);
  assert.equal(updated.title, 'e1-改');
});

test('applyProposal world-card update without entityId 抛错', async () => {
  await assert.rejects(() => applyProposal({ type: 'world-card', operation: 'update', changes: { name: 'x' } }), /缺少 entityId/);
});

test('applyProposal character-card delete + update; 无 entityId 抛错', async () => {
  const w = insertWorld(sandbox.db, { name: 'np-char-w' });
  const c = insertCharacter(sandbox.db, w.id, { name: 'np-char' });
  await applyProposal({ type: 'character-card', operation: 'delete', entityId: c.id });
  // create 必须 worldId
  await assert.rejects(() => applyProposal({ type: 'character-card', operation: 'create', changes: { name: 'x' } }), /需要 worldId/);
  // delete 缺 entityId
  await assert.rejects(() => applyProposal({ type: 'character-card', operation: 'delete' }), /需要 entityId/);
  // update 缺 entityId
  await assert.rejects(() => applyProposal({ type: 'character-card', operation: 'update', changes: { name: 'x' } }), /缺少 entityId/);
});

test('applyProposal persona-card create + update;无 worldId 抛错', async () => {
  const w = insertWorld(sandbox.db, { name: 'np-persona-w' });
  // create
  const r = await applyProposal({
    type: 'persona-card', operation: 'create', entityId: w.id,
    changes: { name: 'pc-1', system_prompt: 'p' },
  });
  assert.ok(r);
  // update 缺 worldId
  await assert.rejects(() => applyProposal({ type: 'persona-card', operation: 'update', changes: { name: 'x' } }), /缺少 worldId/);
  // create 缺 worldId
  await assert.rejects(() => applyProposal({ type: 'persona-card', operation: 'create', changes: { name: 'x' } }), /需要 worldId/);
});

test('applyProposal css-snippet / regex-rule 各错误分支', async () => {
  await assert.rejects(() => applyProposal({ type: 'css-snippet', operation: 'delete' }), /需要 entityId/);
  await assert.rejects(() => applyProposal({ type: 'css-snippet', operation: 'update', changes: {} }), /需要 entityId/);
  await assert.rejects(() => applyProposal({ type: 'regex-rule', operation: 'delete' }), /需要 entityId/);
  await assert.rejects(() => applyProposal({ type: 'regex-rule', operation: 'update', changes: {} }), /需要 entityId/);
});

test('applyProposal 未知 type 抛错', async () => {
  await assert.rejects(() => applyProposal({ type: 'unknown', operation: 'update' }), /未知的提案类型/);
});

test('applyProposal stateFieldOps update + delete', async () => {
  const w = insertWorld(sandbox.db, { name: 'np-sf-w' });
  // 先 create 一个 world 字段
  await applyProposal(normalizeProposal({
    type: 'world-card', operation: 'update', entityId: w.id,
    stateFieldOps: [{ op: 'create', target: 'world', field_key: 'x', label: 'X', type: 'text' }],
  }));
  const fid = sandbox.db.prepare('SELECT id FROM world_state_fields WHERE world_id=? AND field_key=?').get(w.id, 'x').id;
  // update + delete
  await applyProposal({
    type: 'world-card', operation: 'update', entityId: w.id,
    stateFieldOps: [
      { op: 'update', target: 'world', id: fid, label: 'X-改' },
    ],
  });
  await applyProposal({
    type: 'world-card', operation: 'update', entityId: w.id,
    stateFieldOps: [
      { op: 'delete', target: 'world', id: fid },
    ],
  });
  const gone = sandbox.db.prepare('SELECT 1 FROM world_state_fields WHERE id=?').get(fid);
  assert.equal(gone, undefined);
});

test('applyProposal world-card 状态字段 UNIQUE 冲突时幂等跳过', async () => {
  const w = insertWorld(sandbox.db, { name: 'np-unique-w' });
  const proposal = {
    type: 'world-card', operation: 'update', entityId: w.id,
    stateFieldOps: [{ op: 'create', target: 'world', field_key: 'dup', label: 'D', type: 'text', allow_empty: 1, default_value: null, update_mode: 'manual', update_instruction: '', description: '' }],
  };
  await applyProposal(proposal);
  // 第二次 create 相同 field_key 不应抛
  await applyProposal(proposal);
});
