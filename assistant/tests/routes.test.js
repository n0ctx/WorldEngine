import test from 'node:test';
import assert from 'node:assert/strict';

import { __testables } from '../server/routes.js';

test('normalizeProposal 会过滤敏感字段并规范 entry/state ops', () => {
  const proposal = __testables.normalizeProposal({
    changes: {
      llm: { api_key: 'secret', model: 'mock-model' },
      embedding: { api_key: 'embed-secret' },
      global_system_prompt: '新的系统提示',
    },
    entryOps: [
      { op: 'create', title: '条目', description: '描述', content: '内容', keywords: ['A'], keyword_scope: 'both', mode: 'writing' },
    ],
  }, {
    type: 'global-config',
    operation: 'update',
  });

  assert.equal(proposal.type, 'global-config');
  assert.equal(proposal.operation, 'update');
  assert.equal(proposal.changes.llm.api_key, undefined);
  assert.equal(proposal.changes.embedding.api_key, undefined);
  assert.equal(proposal.changes.global_system_prompt, '新的系统提示');
  assert.equal(proposal.entryOps.length, 1);
  assert.equal(proposal.entryOps[0].mode, 'writing');
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
