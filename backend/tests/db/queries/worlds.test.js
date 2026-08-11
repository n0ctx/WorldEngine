import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport } from '../../helpers/test-env.js';
import { insertWorld } from '../../helpers/fixtures.js';

const sandbox = createTestSandbox('query-worlds-suite');
sandbox.setEnv();

after(() => sandbox.cleanup());

const { updateWorld, getWorldById } = await freshImport('backend/db/queries/worlds.js');

test('accent_color / accent_source 新库默认 NULL（可空表示"自动"）', () => {
  const world = insertWorld(sandbox.db, { name: '取色-新建世界' });
  const row = getWorldById(world.id);
  assert.equal(row.accent_color, null);
  assert.equal(row.accent_source, null);
});

test('updateWorld 允许写入 accent_color / accent_source', () => {
  const world = insertWorld(sandbox.db, { name: '取色-可写' });
  const updated = updateWorld(world.id, { accent_color: '#a1b2c3', accent_source: 'auto' });
  assert.equal(updated.accent_color, '#a1b2c3');
  assert.equal(updated.accent_source, 'auto');
});

test('updateWorld 手工指定后再次 patch 其它字段不会清空 accent_color（allowlist 只更新传入字段）', () => {
  const world = insertWorld(sandbox.db, { name: '取色-手动' });
  updateWorld(world.id, { accent_color: '#112233', accent_source: 'manual' });
  const afterNameChange = updateWorld(world.id, { name: '改了名字' });
  assert.equal(afterNameChange.accent_color, '#112233');
  assert.equal(afterNameChange.accent_source, 'manual');
});

test('updateWorld 忽略 allowlist 之外的字段', () => {
  const world = insertWorld(sandbox.db, { name: '取色-防注入' });
  const updated = updateWorld(world.id, { id: 'hacked-id', accent_color: '#445566' });
  assert.equal(updated.id, world.id);
  assert.equal(updated.accent_color, '#445566');
});

test('onboarding_dismissed 新库默认 0（引导默认可见，由前端按完成度决定是否展示）', () => {
  const world = insertWorld(sandbox.db, { name: '引导-新建世界' });
  const row = getWorldById(world.id);
  assert.equal(row.onboarding_dismissed, 0);
});

test('updateWorld 允许写入 onboarding_dismissed，且与完成度判断无关的字段互不影响', () => {
  const world = insertWorld(sandbox.db, { name: '引导-关闭' });
  const updated = updateWorld(world.id, { onboarding_dismissed: 1 });
  assert.equal(updated.onboarding_dismissed, 1);

  const afterNameChange = updateWorld(world.id, { name: '改了名字' });
  assert.equal(afterNameChange.onboarding_dismissed, 1, 'patch 其它字段不应重置关闭状态');
});
