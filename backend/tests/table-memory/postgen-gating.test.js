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

  const { buildTurnPostgenTasks } = await freshImport('backend/app/shared/postgen/build-turn-postgen-tasks.js');
  const { chatMode, writingMode } = await freshImport('backend/app/modes/index.js');

  const chatTask = () =>
    buildTurnPostgenTasks({ mode: chatMode, sessionId: 's1', worldId: 'w1', session: { title: 't' } })
      .find((x) => x.label === 'table-memory');
  const writingTask = () =>
    buildTurnPostgenTasks({ mode: writingMode, sessionId: 's1', worldId: 'w1', session: { title: 't' }, messages: [], includeChapterTitle: false })
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

// 槽位顺序即执行顺序（同优先级按 enqueue 先后），label 又是 hooks/README.md 的对外契约。
// 这条断言比读代码可靠：改动清单结构时会立刻看出漏项或错位。
test('postgen 任务的 label 序列保持稳定', async (t) => {
  const sandbox = createTestSandbox('postgen-label-order', {
    table_memory_enabled: true,
    danmaku: { enabled: true },
    writing: { table_memory_enabled: true },
  });
  sandbox.setEnv();
  t.after(() => { resetMockEnv(); sandbox.cleanup(); });

  const { buildTurnPostgenTasks } = await freshImport('backend/app/shared/postgen/build-turn-postgen-tasks.js');
  const { chatMode, writingMode } = await freshImport('backend/app/modes/index.js');

  const labels = (tasks) => tasks.map((task) => task.label);

  assert.deepEqual(
    labels(buildTurnPostgenTasks({ mode: chatMode, sessionId: 's1', worldId: 'w1', session: { title: 't' } })),
    ['title', 'all-state', 'table-memory', 'danmaku', 'turn-record', 'diary'],
  );

  assert.deepEqual(
    labels(buildTurnPostgenTasks({
      mode: writingMode, sessionId: 's1', worldId: 'w1', session: { title: 't' },
      messages: [], includeChapterTitle: false,
    })),
    ['session-title', 'all-state', 'table-memory', 'danmaku', 'turn-record', 'diary'],
  );
});

// 两侧复制后各自漂移过：对话侧有 isUpdate 守卫但不推 SSE，写作侧推 SSE 但无守卫。
// 统一后取并集，两种模式都既有守卫也有事件。
test('postgen diary 任务在两种模式下都带 isUpdate 守卫与 diary_updated 事件', async (t) => {
  const sandbox = createTestSandbox('postgen-diary-union');
  sandbox.setEnv();
  t.after(() => { resetMockEnv(); sandbox.cleanup(); });

  const { buildTurnPostgenTasks } = await freshImport('backend/app/shared/postgen/build-turn-postgen-tasks.js');
  const { chatMode, writingMode } = await freshImport('backend/app/modes/index.js');

  for (const mode of [chatMode, writingMode]) {
    const diaryOf = (turnRecordOpts) =>
      buildTurnPostgenTasks({ mode, sessionId: 's1', worldId: 'w1', session: { title: 't' }, messages: [], turnRecordOpts })
        .find((task) => task.label === 'diary');

    assert.equal(diaryOf({}).condition, true, `${mode.id}: 正常一轮应生成日记`);
    assert.equal(diaryOf({ isUpdate: true }).condition, false, `${mode.id}: 编辑回复不应重复生成日记`);
    assert.equal(diaryOf({}).sseEvent, 'diary_updated');
    assert.deepEqual(diaryOf({}).ssePayload(), { type: 'diary_updated' });
  }
});
