import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport, resetMockEnv } from '../helpers/test-env.js';
import { insertSession, insertMessage, insertWorld } from '../helpers/fixtures.js';

const sandbox = createTestSandbox('title-generation-suite');

before(() => {
  sandbox.setEnv();
});

after(() => {
  resetMockEnv();
  sandbox.cleanup();
});

test('generateTitle：LLM 首次空返回时会重试并写入标题', async () => {
  resetMockEnv();
  process.env.MOCK_LLM_COMPLETE_QUEUE = JSON.stringify(['', '宫闱密谋']);

  const world = insertWorld(sandbox.db, { name: '测试世界一' });
  const session = insertSession(sandbox.db, { mode: 'writing', world_id: world.id });
  insertMessage(sandbox.db, session.id, { role: 'user', content: '我想借着夜色把账册送进司礼监。' });
  insertMessage(sandbox.db, session.id, { role: 'assistant', content: '你需要先说服值守太监为你开路。' });

  const { generateTitle } = await freshImport('backend/memory/summarizer.js');
  const title = await generateTitle(session.id);

  assert.equal(title, '宫闱密谋');
  const saved = sandbox.db.prepare('SELECT title FROM sessions WHERE id = ?').get(session.id);
  assert.equal(saved.title, '宫闱密谋');
});

test('generateTitle：LLM 持续空返回时放弃写入标题', async () => {
  resetMockEnv();
  process.env.MOCK_LLM_COMPLETE_QUEUE = JSON.stringify(['', '']);

  const world = insertWorld(sandbox.db, { name: '测试世界二' });
  const session = insertSession(sandbox.db, { mode: 'writing', world_id: world.id });
  insertMessage(sandbox.db, session.id, { role: 'user', content: '夜探司礼监账房，查清失窃账册去向。' });
  insertMessage(sandbox.db, session.id, { role: 'assistant', content: '你沿着回廊潜行，避开巡夜的脚步声。' });

  const { generateTitle } = await freshImport('backend/memory/summarizer.js');
  const title = await generateTitle(session.id);

  assert.equal(title, null);
  const saved = sandbox.db.prepare('SELECT title FROM sessions WHERE id = ?').get(session.id);
  assert.equal(saved.title, null);
});

test('generateChapterTitle：LLM 持续空返回时返回 null', async () => {
  resetMockEnv();
  process.env.MOCK_LLM_COMPLETE_QUEUE = JSON.stringify(['', '']);

  const world = insertWorld(sandbox.db, { name: '测试世界三' });
  const session = insertSession(sandbox.db, { mode: 'writing', world_id: world.id });
  const { generateChapterTitle } = await freshImport('backend/memory/chapter-title-generator.js');
  const title = await generateChapterTitle(session.id, 2, [
    { role: 'user', content: '潜入枯井取回账册，再借夜雾脱身。' },
    { role: 'assistant', content: '你在宫墙阴影里听见了追兵的脚步。' },
  ]);

  assert.equal(title, null);
});
