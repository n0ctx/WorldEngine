import test from 'node:test';
import assert from 'node:assert/strict';

import { __testables } from '../server/routes.js';

test('normalizeProposal 会过滤敏感字段并规范 global-config changes', () => {
  const proposal = __testables.normalizeProposal({
    changes: {
      llm: { api_key: 'secret', model: 'mock-model' },
      embedding: { api_key: 'embed-secret' },
      global_system_prompt: '新的系统提示',
    },
  }, {
    type: 'global-config',
    operation: 'update',
  });

  assert.equal(proposal.type, 'global-config');
  assert.equal(proposal.operation, 'update');
  assert.equal(proposal.changes.llm.api_key, undefined);
  assert.equal(proposal.changes.embedding.api_key, undefined);
  assert.equal(proposal.changes.global_system_prompt, '新的系统提示');
  assert.equal(proposal.entryOps, undefined);
});

test('normalizeStateFieldOps 会校验 target/type 并规范 create/delete', () => {
  const ops = __testables.normalizeStateFieldOps([
    {
      op: 'create',
      target: 'character',
      field_key: 'mood',
      label: '心情',
      type: 'enum',
      enum_options: ['平静', '警惕'],
      allow_empty: 0,
    },
    {
      op: 'delete',
      target: 'persona',
      id: 'field-1',
    },
  ], 'character-card');

  assert.deepEqual(ops[0], {
    op: 'create',
    target: 'character',
    field_key: 'mood',
    label: '心情',
    type: 'enum',
    description: '',
    default_value: null,
    update_mode: 'manual',
    trigger_mode: 'manual_only',
    update_instruction: '',
    allow_empty: 0,
    enum_options: ['平静', '警惕'],
  });
  assert.deepEqual(ops[1], { op: 'delete', target: 'persona', id: 'field-1' });
});

test('normalizeRegexRuleChanges 与 pickAllowed/deepOmit 处理边界值', () => {
  const changes = __testables.normalizeRegexRuleChanges({
    name: '替换规则',
    pattern: 'foo',
    replacement: 'bar',
    scope: 'invalid-scope',
    enabled: 0,
  });

  assert.deepEqual(changes, {
    name: '替换规则',
    pattern: 'foo',
    replacement: 'bar',
    flags: 'g',
    scope: 'display_only',
    world_id: null,
    mode: 'chat',
    enabled: 0,
  });

  assert.deepEqual(__testables.pickAllowed({ a: 1, b: 2 }, ['b']), { b: 2 });
  assert.deepEqual(__testables.deepOmit({ llm: { api_key: 'x', model: 'm' }, keep: 1 }, ['llm.api_key']), {
    llm: { model: 'm' },
    keep: 1,
  });
});

test('normalizeProposal 会拒绝未知提案类型与非法 operation', () => {
  assert.throws(
    () => __testables.normalizeProposal({ type: 'unknown-type' }),
    /未知的 proposal type/,
  );

  assert.throws(
    () => __testables.normalizeProposal({ type: 'global-config', operation: 'delete' }),
    /global-config 不支持 operation=delete/,
  );
});

test('normalizeProposal 会校验 css-snippet 与 regex-rule 的必要字段', () => {
  assert.throws(
    () => __testables.normalizeProposal({
      type: 'css-snippet',
      operation: 'create',
      changes: { content: '   ' },
    }),
    /css-snippet\.changes\.content 不能为空/,
  );

  assert.throws(
    () => __testables.normalizeProposal({
      type: 'regex-rule',
      operation: 'create',
      changes: { pattern: '   ' },
    }),
    /regex-rule\.changes\.pattern 不能为空/,
  );
});

test('normalizeProposal 会锁定 type/entityId 并拒绝非法 entry/state 操作', () => {
  const proposal = __testables.normalizeProposal({
    type: 'character-card',
    entityId: 'raw-character',
    changes: { name: '新名字' },
  }, {
    type: 'world-card',
    operation: 'update',
    entityId: 'locked-world',
  });

  assert.equal(proposal.type, 'world-card');
  assert.equal(proposal.entityId, 'locked-world');
  assert.deepEqual(proposal.changes, { name: '新名字' });

  assert.throws(
    () => __testables.normalizeProposal({
      type: 'world-card',
      entryOps: [{ op: 'update', title: '缺少 id' }],
    }),
    /entryOps\[0\]\.id 缺失/,
  );

  assert.throws(
    () => __testables.normalizeProposal({
      type: 'character-card',
      stateFieldOps: [{ op: 'create', target: 'world', field_key: 'mood', label: '心情', type: 'text' }],
    }),
    /stateFieldOps\[0\]\.target 非法/,
  );
});

test('normalizeProposal 会从 world-card changes 中过滤 system_prompt 与 post_prompt', () => {
  const proposal = __testables.normalizeProposal({
    entityId: 'world-123',
    changes: {
      name: '新世界',
      system_prompt: '世界背景...',
      post_prompt: '格式提醒...',
      temperature: 0.9,
    },
    entryOps: [],
    stateFieldOps: [],
  }, {
    type: 'world-card',
    operation: 'update',
  });

  assert.equal(proposal.changes.name, '新世界');
  assert.equal(proposal.changes.temperature, 0.9);
  assert.equal(proposal.changes.system_prompt, undefined);
  assert.equal(proposal.changes.post_prompt, undefined);
});

test('normalizeProposal 不会在 character-card 中包含 entryOps', () => {
  const proposal = __testables.normalizeProposal({
    entityId: 'char-123',
    changes: { name: '角色' },
    entryOps: [{ op: 'create', title: '秘密', content: '内容', keywords: [] }],
    stateFieldOps: [],
  }, {
    type: 'character-card',
    operation: 'update',
  });

  assert.equal(proposal.entryOps, undefined);
});

test('normalizeProposal 会保留 character/persona 的 description，并移除 global-config.entryOps', () => {
  const characterProposal = __testables.normalizeProposal({
    entityId: 'char-123',
    changes: {
      name: '角色',
      description: '一句话简介',
      system_prompt: '角色设定',
    },
  }, {
    type: 'character-card',
    operation: 'update',
  });

  const personaProposal = __testables.normalizeProposal({
    entityId: 'world-123',
    changes: {
      name: '玩家',
      description: '一句话简介',
      system_prompt: '玩家设定',
    },
  }, {
    type: 'persona-card',
    operation: 'update',
  });

  const globalProposal = __testables.normalizeProposal({
    changes: { global_system_prompt: '全局提示' },
    entryOps: [{ op: 'create', title: '无效', content: '不会保留' }],
  }, {
    type: 'global-config',
    operation: 'update',
  });

  assert.equal(characterProposal.changes.description, '一句话简介');
  assert.equal(personaProposal.changes.description, '一句话简介');
  assert.equal(globalProposal.entryOps, undefined);
});

test('normalizeProposal 会把 world-card state 条件归一到当前运行时格式', () => {
  const proposal = __testables.normalizeProposal({
    entityId: 'world-123',
    entryOps: [{
      op: 'create',
      title: '重伤提醒',
      trigger_type: 'state',
      content: '玩家重伤时，场上角色要明确做出反应。',
      conditions: [
        { target_field: 'hp', operator: 'lt', value: '30' },
        { target_field: 'story_phase', operator: 'eq', value: '决战' },
      ],
    }],
    stateFieldOps: [
      { op: 'create', target: 'persona', field_key: 'hp', label: 'HP', type: 'number' },
      { op: 'create', target: 'world', field_key: 'story_phase', label: '剧情阶段', type: 'enum' },
    ],
  }, {
    type: 'world-card',
    operation: 'update',
  });

  assert.deepEqual(proposal.entryOps[0].conditions, [
    { target_field: '玩家.HP', operator: '<', value: '30' },
    { target_field: '世界.剧情阶段', operator: '等于', value: '决战' },
  ]);
});

test('normalizeProposal 遇到歧义 state 条件字段时会拒绝自动归一', () => {
  assert.throws(
    () => __testables.normalizeProposal({
      entryOps: [{
        op: 'create',
        title: '歧义条件',
        trigger_type: 'state',
        content: '...',
        conditions: [{ target_field: 'progress', operator: 'gt', value: '1' }],
      }],
      stateFieldOps: [
        { op: 'create', target: 'world', field_key: 'progress', label: '世界进度', type: 'number' },
        { op: 'create', target: 'persona', field_key: 'progress', label: '玩家进度', type: 'number' },
      ],
    }, {
      type: 'world-card',
      operation: 'update',
      entityId: 'world-123',
    }),
    /存在多个同名 field_key/,
  );
});
