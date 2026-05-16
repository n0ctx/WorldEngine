import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport, resetMockEnv } from '../helpers/test-env.js';
import { insertMessage, insertSession, insertWorld } from '../helpers/fixtures.js';

const sandbox = createTestSandbox('saved-nearby-recall-suite');
sandbox.setEnv();

after(() => {
  resetMockEnv();
  sandbox.cleanup();
});

function setupSession() {
  const world = insertWorld(sandbox.db, { name: '雾港' });
  const session = insertSession(sandbox.db, { world_id: world.id, mode: 'writing' });
  insertMessage(sandbox.db, session.id, { role: 'user', content: '我去找林晚谈那笔旧账', created_at: 1 });
  insertMessage(sandbox.db, session.id, { role: 'assistant', content: '林晚抬眼看了你一下。', created_at: 2 });
  return { world, session };
}

test('savedRows 为空时直接返回 []', async () => {
  resetMockEnv();
  const { session } = setupSession();
  const { decideSavedNearbyRecall } = await freshImport('backend/memory/saved-nearby-recall.js');
  const result = await decideSavedNearbyRecall({ sessionId: session.id, savedRows: [] });
  assert.deepEqual(result, []);
});

test('过滤不在候选清单中的 id 并去重', async () => {
  resetMockEnv();
  process.env.MOCK_LLM_COMPLETE = JSON.stringify({
    recall: ['s-1', 's-2', 's-1', 'not-in-list'],
  });

  const { session } = setupSession();
  const { decideSavedNearbyRecall } = await freshImport('backend/memory/saved-nearby-recall.js');
  const result = await decideSavedNearbyRecall({
    sessionId: session.id,
    savedRows: [
      { id: 's-1', name: '林晚', persona: '沉默寡言' },
      { id: 's-2', name: '佐藤遥', persona: '雷厉风行' },
    ],
  });

  assert.deepEqual(result, ['s-1', 's-2']);
});

test('JSON 解析失败时静默回退为空数组', async () => {
  resetMockEnv();
  process.env.MOCK_LLM_COMPLETE = 'not-json';

  const { session } = setupSession();
  const { decideSavedNearbyRecall } = await freshImport('backend/memory/saved-nearby-recall.js');
  const result = await decideSavedNearbyRecall({
    sessionId: session.id,
    savedRows: [{ id: 's-1', name: '林晚', persona: '沉默寡言' }],
  });

  assert.deepEqual(result, []);
});

test('近期上下文为空时不调用 LLM 直接返回 []', async () => {
  resetMockEnv();
  // 故意设置一个会被记录但不应被消费的 mock；如果实现错误调用了 LLM，会返回 ['s-1']
  process.env.MOCK_LLM_COMPLETE = JSON.stringify({ recall: ['s-1'] });

  const world = insertWorld(sandbox.db, { name: '空港' });
  const session = insertSession(sandbox.db, { world_id: world.id, mode: 'writing' });
  // 不插入任何 message

  const { decideSavedNearbyRecall } = await freshImport('backend/memory/saved-nearby-recall.js');
  const result = await decideSavedNearbyRecall({
    sessionId: session.id,
    savedRows: [{ id: 's-1', name: '林晚', persona: '沉默寡言' }],
  });

  assert.deepEqual(result, []);
});

