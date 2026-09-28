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
    ['title', 'all-state', 'table-memory', 'turn-record', 'danmaku', 'turn-index', 'diary'],
  );

  assert.deepEqual(
    labels(buildTurnPostgenTasks({
      mode: writingMode, sessionId: 's1', worldId: 'w1', session: { title: 't' },
      messages: [], includeChapterTitle: false,
    })),
    ['session-title', 'all-state', 'table-memory', 'turn-record', 'danmaku', 'turn-index', 'diary'],
  );
});

// turn-record 是唯一登记记忆提交等待点的任务；turn-index 不阻塞下一轮。
test('turn-record 任务登记 blocksNextTurn，其余任务不登记', async (t) => {
  const sandbox = createTestSandbox('postgen-blocks-next-turn');
  sandbox.setEnv();
  t.after(() => { resetMockEnv(); sandbox.cleanup(); });

  const { buildTurnPostgenTasks } = await freshImport('backend/app/shared/postgen/build-turn-postgen-tasks.js');
  const { chatMode } = await freshImport('backend/app/modes/index.js');

  const tasks = buildTurnPostgenTasks({ mode: chatMode, sessionId: 's1', worldId: 'w1', session: { title: 't' } });
  const byLabel = (label) => tasks.find((t2) => t2.label === label);

  assert.equal(byLabel('turn-record').blocksNextTurn, true);
  for (const label of ['title', 'all-state', 'table-memory', 'danmaku', 'turn-index', 'diary']) {
    assert.equal(byLabel(label).blocksNextTurn, undefined, `${label} 不应登记 blocksNextTurn`);
  }
});

// diary 不再有 isUpdate 守卫：编辑最后一条回复走「回退到上一轮快照再重跑」（§5.6），
// 重做时会先删掉本轮日记，需要重新生成，因此两种模式下都无条件生成 diary_updated。
test('postgen diary 任务在两种模式下都无条件生成并推 diary_updated 事件', async (t) => {
  const sandbox = createTestSandbox('postgen-diary-union');
  sandbox.setEnv();
  t.after(() => { resetMockEnv(); sandbox.cleanup(); });

  const { buildTurnPostgenTasks } = await freshImport('backend/app/shared/postgen/build-turn-postgen-tasks.js');
  const { chatMode, writingMode } = await freshImport('backend/app/modes/index.js');

  for (const mode of [chatMode, writingMode]) {
    const diaryOf = (turnRecordOpts) =>
      buildTurnPostgenTasks({ mode, sessionId: 's1', worldId: 'w1', session: { title: 't' }, messages: [], turnRecordOpts })
        .find((task) => task.label === 'diary');

    assert.equal(diaryOf({}).condition, undefined, `${mode.id}: diary 不应再有条件`);
    assert.equal(diaryOf({ isUpdate: true }).condition, undefined, `${mode.id}: isUpdate 不应再影响 diary`);
    assert.equal(diaryOf({}).sseEvent, 'diary_updated');
    assert.deepEqual(diaryOf({}).ssePayload(), { type: 'diary_updated' });
  }
});
