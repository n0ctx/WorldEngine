import test from 'node:test';
import assert from 'node:assert/strict';

import { __testables, useAssistantStore } from '../client/useAssistantStore.js';
import { __testables as storageTestables, createSplitStorage, sanitizeMessagesForPersist } from '../client/assistant-storage.js';
import { SSE_EVENTS } from '../server/sse-events.js';

test('sanitizeMessagesForPersist 保留对话与工具记录、丢弃旧版计划/步骤行、清理运行态', () => {
  const messages = [
    { id: 'u1', role: 'user', content: 'hello' },
    { id: 'a1', role: 'assistant', content: '<think>x</think>\n正文', streaming: true },
    { id: 'call-1', role: 'tool_call', toolName: 'read', summary: 'world', status: 'done' },
    { id: 'call-2', role: 'tool_call', toolName: 'create', summary: 'entry 王都', status: 'running' },
    { id: 'step-1', role: 'step', stepId: 'step-1', title: '写入', status: 'running' },
    { id: 'plan-doc-task-1', role: 'plan_doc', content: '# plan' },
    { id: 'x', role: 'unknown', content: 'drop' },
  ];

  const got = sanitizeMessagesForPersist(messages);
  assert.deepEqual(got.map((m) => m.role), ['user', 'assistant', 'tool_call', 'tool_call']);
  assert.equal(got[1].streaming, undefined);
  assert.equal(got[2].status, 'done');
  assert.equal(got[3].status, 'error');
  assert.match(got[3].error, /刷新后运行状态已中断/);
});

test('clearStreamingFlag 清理最近的 streaming assistant 而不是只看最后一条', () => {
  const got = __testables.clearStreamingFlag([
    { id: 'a1', role: 'assistant', content: 'hello', streaming: true },
    { id: 'call-1', role: 'tool_call', toolName: 'read', status: 'done' },
  ]);

  assert.equal(got[0].streaming, false);
  assert.equal(got[1].role, 'tool_call');
});

test('applyTaskSnapshot 用服务端快照整体替换任务态', () => {
  const state = {
    taskId: 'task-old',
    status: 'running',
    messages: [{ id: 'old', role: 'assistant', content: '旧内容' }],
    error: null,
  };
  const next = __testables.applyTaskSnapshot(state, {
    id: 'task-new',
    status: 'failed',
    messages: [
      { id: 'u1', role: 'user', content: '你好' },
      { id: 'c1', role: 'tool_call', toolName: 'update', summary: 'entry:e1', status: 'error', error: '条目不存在' },
    ],
    error: 'interrupted by restart',
  });

  assert.equal(next.taskId, 'task-new');
  assert.equal(next.status, 'failed');
  assert.deepEqual(next.messages.map((m) => m.role), ['user', 'tool_call']);
  assert.equal(next.messages[1].error, '条目不存在');
  assert.equal(next.error, 'interrupted by restart');
});

test('上下文占用事件更新占用值，带压缩记录时追加到消息列表，刷新后压缩记录保留', () => {
  const store = useAssistantStore;
  store.getState().reset();
  store.getState().pushUserMessage('你好', 'u1');

  store.getState().ingestEvent({ type: SSE_EVENTS.CONTEXT_USAGE, usage: { tokens: 5000, limit: 122880 }, appended: [] });
  assert.deepEqual(store.getState().contextUsage, { tokens: 5000, limit: 122880 });
  assert.equal(store.getState().messages.length, 1);

  const compaction = { id: 'msg-c1', role: 'compaction', tokensBefore: 99000, tokensAfter: 6000 };
  store.getState().ingestEvent({ type: SSE_EVENTS.CONTEXT_USAGE, usage: { tokens: 6000, limit: 122880 }, appended: [compaction] });
  assert.deepEqual(store.getState().messages.map((m) => m.role), ['user', 'compaction']);
  assert.deepEqual(sanitizeMessagesForPersist(store.getState().messages).at(-1), compaction);

  store.getState().reset();
  assert.equal(store.getState().contextUsage, null);
});

test('applyTaskSnapshot 带上快照里的占用值；快照没有时沿用现有值', () => {
  const state = { taskId: 't', status: 'running', messages: [], error: null, contextUsage: { tokens: 1, limit: 10 } };
  const withUsage = __testables.applyTaskSnapshot(state, { id: 't', status: 'completed', messages: [], contextUsage: { tokens: 4, limit: 10 } });
  assert.deepEqual(withUsage.contextUsage, { tokens: 4, limit: 10 });
  const without = __testables.applyTaskSnapshot(state, { id: 't', status: 'completed', messages: [], contextUsage: null });
  assert.deepEqual(without.contextUsage, { tokens: 1, limit: 10 });
});

// 内存版 localStorage，测拆块写盘与合并读回
function withMemoryStorage(fn) {
  const data = new Map();
  const prev = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
  try {
    return fn(data);
  } finally {
    globalThis.localStorage = prev;
  }
}

test('任务运行中：轻块照写（taskId、输入栏草稿），消息块不写；结束后消息块落盘，两块合并读回', () => {
  withMemoryStorage((data) => {
    const { HEAVY_KEY, LIVE_KEY } = storageTestables;
    const storage = createSplitStorage();
    const messages = [{ id: 'a1', role: 'assistant', content: '写到一半', streaming: true }];

    storage.setItem(HEAVY_KEY, { state: { taskId: 'task-new', status: 'running', draft: '再加一个', messages }, version: 0 });
    assert.equal(data.has(HEAVY_KEY), false);
    assert.deepEqual(storage.getItem(HEAVY_KEY).state, { taskId: 'task-new', status: 'running', draft: '再加一个' });

    storage.setItem(HEAVY_KEY, { state: { taskId: 'task-new', status: 'completed', draft: '', messages }, version: 0 });
    const restored = storage.getItem(HEAVY_KEY).state;
    assert.equal(restored.status, 'completed');
    assert.equal(restored.messages[0].content, '写到一半');
    assert.equal(restored.messages[0].streaming, undefined);
    assert.equal(JSON.parse(data.get(LIVE_KEY)).state.messages, undefined);

    storage.removeItem(HEAVY_KEY);
    assert.equal(storage.getItem(HEAVY_KEY), null);
  });
});

test('输入栏草稿、思考块展开、行内编辑、滚动位置都进持久化；清空对话时只保留草稿', () => {
  const store = useAssistantStore;
  store.getState().reset();
  store.setState({ messages: [{ id: 'a1', role: 'assistant', content: 'x' }, { id: 'u1', role: 'user', content: '原文' }] });
  const s = store.getState();
  s.setDraft('打了一半');
  s.toggleThink('a1:0');
  s.startEditing('u1', '原文');
  s.setEditingDraft('改了一半');
  s.setScrollTop(120);

  const persisted = store.persist.getOptions().partialize(store.getState());
  assert.equal(persisted.draft, '打了一半');
  assert.deepEqual(persisted.expandedThinks, { 'a1:0': true });
  assert.equal(persisted.editingMessageId, 'u1');
  assert.equal(persisted.editingDraft, '改了一半');
  assert.equal(persisted.scrollTop, 120);

  store.getState().toggleThink('a1:0');
  assert.deepEqual(store.getState().expandedThinks, {});

  store.getState().reset();
  const after = store.getState();
  assert.equal(after.draft, '打了一半');
  assert.equal(after.editingMessageId, null);
  assert.equal(after.scrollTop, null);
});

test('toggleThink 顺手清掉已删除消息的展开记录', () => {
  const store = useAssistantStore;
  store.setState({ messages: [{ id: 'a2', role: 'assistant', content: 'x' }], expandedThinks: { 'gone:0': true } });
  store.getState().toggleThink('a2:1');
  assert.deepEqual(store.getState().expandedThinks, { 'a2:1': true });
});
