import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport, resetMockEnv } from '../helpers/test-env.js';
import { insertMessage, insertSession, insertTurnRecord, insertWorld } from '../helpers/fixtures.js';

const sandbox = createTestSandbox('summary-expander-suite');
sandbox.setEnv();

after(() => {
  resetMockEnv();
  sandbox.cleanup();
});

test('decideExpansion 会过滤不在 recalled 集合中的 id 并去重', async () => {
  resetMockEnv();
  process.env.MOCK_LLM_COMPLETE = JSON.stringify({
    expand: ['rid-1', 'rid-2', 'rid-1', 'invalid-id'],
  });

  const world = insertWorld(sandbox.db, { name: '晨星' });
  const session = insertSession(sandbox.db, { world_id: world.id, mode: 'writing' });
  insertMessage(sandbox.db, session.id, { role: 'user', content: '提到旧战役', created_at: 1 });
  insertMessage(sandbox.db, session.id, { role: 'assistant', content: '你回忆起盟约。', created_at: 2 });

  const { decideExpansion } = await freshImport('backend/memory/summary-expander.js');
  const result = await decideExpansion({
    sessionId: session.id,
    recalled: [
      { ref: 1, turn_record_id: 'rid-1', created_at: 1, session_title: '会话A', round_index: 1, content: '第一条', is_same_session: false },
      { ref: 2, turn_record_id: 'rid-2', created_at: 2, session_title: '会话B', round_index: 2, content: '第二条', is_same_session: true },
    ],
  });

  assert.deepEqual(result, ['rid-1', 'rid-2']);
});

test('decideExpansion 在 JSON 解析失败时静默回退为空数组', async () => {
  resetMockEnv();
  process.env.MOCK_LLM_COMPLETE = 'not-json';

  const session = insertSession(sandbox.db, { world_id: insertWorld(sandbox.db).id, mode: 'writing' });
  const { decideExpansion } = await freshImport('backend/memory/summary-expander.js');
  const result = await decideExpansion({
    sessionId: session.id,
    recalled: [{ ref: 1, turn_record_id: 'rid-1', created_at: 1, session_title: '会话', round_index: 1, content: '摘要', is_same_session: false }],
  });

  assert.deepEqual(result, []);
});

test('renderExpandedTurnRecords 会按 tokenBudget 渲染原文并跳过缺失记录', async () => {
  const world = insertWorld(sandbox.db, { name: '霜港' });
  const session = insertSession(sandbox.db, { world_id: world.id, title: '旧档案', mode: 'writing' });
  const user1 = insertMessage(sandbox.db, session.id, { role: 'user', content: '第一问', created_at: 1 });
  const asst1 = insertMessage(sandbox.db, session.id, { role: 'assistant', content: '第一答', created_at: 2 });
  const user2 = insertMessage(sandbox.db, session.id, { role: 'user', content: '第二问', created_at: 3 });
  const asst2 = insertMessage(sandbox.db, session.id, { role: 'assistant', content: '第二答', created_at: 4 });

  const record1 = insertTurnRecord(sandbox.db, session.id, {
    id: 'turn-1',
    round_index: 1,
    summary: '第一轮',
    user_message_id: user1.id,
    asst_message_id: asst1.id,
    created_at: 10,
  });
  insertTurnRecord(sandbox.db, session.id, {
    id: 'turn-2',
    round_index: 2,
    summary: '第二轮',
    user_message_id: user2.id,
    asst_message_id: asst2.id,
    created_at: 20,
  });

  const { renderExpandedTurnRecords } = await freshImport('backend/memory/summary-expander.js');
  const result = renderExpandedTurnRecords([record1.id, 'missing', 'turn-2'], 40);

  assert.match(result, /\[历史对话原文展开\]/);
  assert.match(result, /旧档案/);
  assert.match(result, /第一问/);
  assert.match(result, /第一答/);
});
