import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createRouteTestContext } from '../helpers/http.js';
import { freshImport, resetMockEnv } from '../helpers/test-env.js';
import { insertSession, insertTurnRecord } from '../helpers/fixtures.js';

const ctx = createRouteTestContext('routes-middle-summary');
after(() => ctx.close());

test('GET /api/sessions/:sessionId/middle-summary 在无 turn record 时返回空内容；会话不存在 404', async () => {
  const session = insertSession(ctx.sandbox.db);
  const res = await ctx.request(`/api/sessions/${session.id}/middle-summary`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { content: '', coveredTo: 0, closedTo: 0, openLines: [] });

  const notFound = await ctx.request('/api/sessions/no-such/middle-summary');
  assert.equal(notFound.status, 404);
});

test('GET /api/sessions/:sessionId/middle-summary 在 middle_covered_to 为 null 时按 0 返回', async () => {
  const session = insertSession(ctx.sandbox.db);
  insertTurnRecord(ctx.sandbox.db, session.id, { round_index: 1, middle_summary: null, middle_covered_to: null });

  const res = await ctx.request(`/api/sessions/${session.id}/middle-summary`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { content: '', coveredTo: 0, closedTo: 0, openLines: [] });
});

test('GET/PUT /api/sessions/:sessionId/middle-summary 往返；PUT 在无 turn record 时 409', async () => {
  const session = insertSession(ctx.sandbox.db);

  const putBeforeAnyRound = await ctx.request(`/api/sessions/${session.id}/middle-summary`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: '摘要' }),
  });
  assert.equal(putBeforeAnyRound.status, 409);

  insertTurnRecord(ctx.sandbox.db, session.id, { round_index: 1, middle_summary: '原摘要', middle_covered_to: 1 });

  const get1 = await ctx.request(`/api/sessions/${session.id}/middle-summary`);
  assert.deepEqual(await get1.json(), { content: '原摘要', coveredTo: 1, closedTo: 1, openLines: [] });

  const put = await ctx.request(`/api/sessions/${session.id}/middle-summary`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: '编辑后的摘要' }),
  });
  assert.equal(put.status, 200);
  assert.deepEqual(await put.json(), { content: '编辑后的摘要' });

  const get2 = await ctx.request(`/api/sessions/${session.id}/middle-summary`);
  assert.deepEqual(await get2.json(), { content: '编辑后的摘要', coveredTo: 1, closedTo: 1, openLines: [] });
});

test('GET /api/sessions/:sessionId/middle-summary 返回进行中事件的逐轮索引行，不含已整理和未滑出的轮次', async () => {
  const session = insertSession(ctx.sandbox.db);
  const closed = '【第1–2轮｜不详｜南巷｜李石头】\n起因：无\n经过：无\n结果：无\n变化：无';
  insertTurnRecord(ctx.sandbox.db, session.id, { round_index: 1, summary: '第一轮索引' });
  insertTurnRecord(ctx.sandbox.db, session.id, { round_index: 2, summary: '第二轮索引' });
  insertTurnRecord(ctx.sandbox.db, session.id, { round_index: 3, summary: '第三轮索引' });
  insertTurnRecord(ctx.sandbox.db, session.id, { round_index: 4, summary: '第四轮索引' });
  insertTurnRecord(ctx.sandbox.db, session.id, { round_index: 5, summary: '第五轮索引', middle_summary: closed, middle_covered_to: 4 });

  const res = await ctx.request(`/api/sessions/${session.id}/middle-summary`);
  assert.deepEqual(await res.json(), {
    content: closed,
    coveredTo: 4,
    closedTo: 2,
    openLines: ['第3轮：第三轮索引', '第4轮：第四轮索引'],
  });
});

test('PUT /api/sessions/:sessionId/middle-summary 在会话不存在时 404', async () => {
  const res = await ctx.request('/api/sessions/no-such/middle-summary', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: 'x' }),
  });
  assert.equal(res.status, 404);
});

test('编辑后下一轮 computeMiddleSummary 以编辑后的文本为基线', async () => {
  resetMockEnv();
  const session = insertSession(ctx.sandbox.db, { mode: 'chat' });
  insertTurnRecord(ctx.sandbox.db, session.id, { round_index: 1, middle_summary: '原摘要', middle_covered_to: 1 });

  const put = await ctx.request(`/api/sessions/${session.id}/middle-summary`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: '人工编辑后的剧情摘要' }),
  });
  assert.equal(put.status, 200);

  const { computeMiddleSummary } = await freshImport('backend/memory/middle-summary.js');
  const result = await computeMiddleSummary(session.id, 2);
  assert.equal(result.text, '人工编辑后的剧情摘要');
  assert.equal(result.coveredTo, 1);
});
