import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { dispatchToolRefresh } from '../client/tool-refresh.js';

function captureEvents() {
  const names = [];
  globalThis.window = { dispatchEvent: (evt) => names.push(evt.type) };
  return names;
}

afterEach(() => {
  delete globalThis.window;
});

test('写入成功后按资源类型派发刷新事件', () => {
  const names = captureEvents();
  dispatchToolRefresh({ toolName: 'update', target: 'character' }, { success: true });
  assert.deepEqual(names, ['we:character-updated']);
});

test('一次调用涉及多种资源时每种事件各派发一次', () => {
  const names = captureEvents();
  dispatchToolRefresh({ toolName: 'create', target: 'field', targets: ['field', 'entry', 'persona', 'character'] }, { success: true });
  assert.deepEqual(names, ['we:world-updated', 'we:persona-updated', 'we:character-updated']);
});

test('批量只完成一部分时也刷新，整体失败与只读工具不刷新', () => {
  const names = captureEvents();
  dispatchToolRefresh({ toolName: 'delete', target: 'entry' }, { success: false, partial: true });
  assert.deepEqual(names, ['we:world-updated']);
  dispatchToolRefresh({ toolName: 'delete', target: 'entry' }, { success: false });
  dispatchToolRefresh({ toolName: 'read', target: 'entry' }, { success: true });
  dispatchToolRefresh(undefined, { success: true });
  assert.deepEqual(names, ['we:world-updated']);
});
