import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestSandbox, freshImport, resetMockEnv } from '../helpers/test-env.js';

// 表格记忆开关门控：关闭时 postgen 的 table-memory 任务 condition 为 false（不跑 updateTableMemory）。
// getConfig 每次调用都重读 config 文件，故可通过 writeConfig 在同一进程内切换开关。
test('postgen table-memory 任务随开关门控（chat + writing）', async (t) => {
  const sandbox = createTestSandbox('postgen-gating', {
    table_memory_enabled: true,
    writing: { table_memory_enabled: true },
  });
  sandbox.setEnv();
  t.after(() => { resetMockEnv(); sandbox.cleanup(); });

  const { buildChatPostgenTasks } = await freshImport('backend/app/chat/build-chat-postgen-tasks.js');
  const { buildWritingPostgenTasks } = await freshImport('backend/app/writing/build-writing-postgen-tasks.js');

  const chatTask = () =>
    buildChatPostgenTasks({ sessionId: 's1', worldId: 'w1', characterId: null, session: { title: 't' } })
      .find((x) => x.label === 'table-memory');
  const writingTask = () =>
    buildWritingPostgenTasks({ sessionId: 's1', worldId: 'w1', session: { title: 't' }, messages: [], includeChapterTitle: false })
      .find((x) => x.label === 'table-memory');

  // 开关开 → condition true
  assert.equal(chatTask().condition, true);
  assert.equal(writingTask().condition, true);

  // 开关关 → condition false（该轮不跑表格更新）
  const cfg = sandbox.readConfig();
  cfg.table_memory_enabled = false;
  cfg.writing.table_memory_enabled = false;
  sandbox.writeConfig(cfg);

  assert.equal(chatTask().condition, false);
  assert.equal(writingTask().condition, false);
});
