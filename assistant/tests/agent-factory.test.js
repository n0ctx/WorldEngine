import test from 'node:test';
import assert from 'node:assert/strict';

import { __testables } from '../server/agent-factory.js';

test('buildAgentMessages 会把 prompt 模板拆成 system + user 两段', () => {
  const messages = __testables.buildAgentMessages('world_card_agent', '请修改世界卡');

  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, 'system');
  assert.equal(messages[1].role, 'user');
  assert.match(messages[1].content, /请修改世界卡/);
});
