import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createRouteTestContext } from '../helpers/http.js';
import { insertContextBlock, insertMessage, insertSession } from '../helpers/fixtures.js';

const ctx = createRouteTestContext('routes-context-blocks', { short_term_token_budget: 1000 });
after(() => ctx.close());

function seedRounds(sessionId, rounds) {
  for (let round = 1; round <= rounds; round++) {
    insertMessage(ctx.sandbox.db, sessionId, { role: 'user', content: `第${round}轮提问`, created_at: round * 10 });
    insertMessage(ctx.sandbox.db, sessionId, { role: 'assistant', content: round === 2 ? '老魏把青铜罗盘交给林遥' : `第${round}轮回答`, created_at: round * 10 + 1 });
  }
}

const json = (body) => ({ headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('GET /context 返回在用块与上下文统计；会话不存在 404', async () => {
  const session = insertSession(ctx.sandbox.db);
  seedRounds(session.id, 5);
  const block = insertContextBlock(ctx.sandbox.db, session.id, { from_round: 1, to_round: 3, topic: '渡口', summary: '林遥在渡口得到罗盘', raw_tokens: 60 });

  const res = await ctx.request(`/api/sessions/${session.id}/context`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.blocks.map((b) => [b.id, b.no, b.tier, b.fromRound, b.toRound, b.topic, b.childCount]), [[block.id, 1, 1, 1, 3, '渡口', 0]]);
  assert.equal(body.stats.latestRound, 5);
  assert.equal(body.stats.coveredRounds, 3);
  assert.equal(body.stats.rawRounds, 2);
  assert.equal(body.stats.budget, 1000);
  assert.ok(body.stats.compressionRatio > 0);

  assert.equal((await ctx.request('/api/sessions/no-such/context')).status, 404);
});

test('GET /context/blocks/:id/source 展开原文；PUT 改摘要写库；不存在或已失效的块 404，空摘要 400', async () => {
  const session = insertSession(ctx.sandbox.db);
  seedRounds(session.id, 4);
  const block = insertContextBlock(ctx.sandbox.db, session.id, { from_round: 1, to_round: 2 });
  const stale = insertContextBlock(ctx.sandbox.db, session.id, { from_round: 3, to_round: 3, source_digest: 'stale' });

  const source = await (await ctx.request(`/api/sessions/${session.id}/context/blocks/${block.id}/source`)).json();
  assert.deepEqual(source.rounds.map((r) => r.round), [1, 2]);
  assert.equal(source.rounds[1].messages[1].content, '老魏把青铜罗盘交给林遥');

  const put = await ctx.request(`/api/sessions/${session.id}/context/blocks/${block.id}`, { method: 'PUT', ...json({ summary: ' 手改后的摘要 ', topic: '交接' }) });
  assert.equal(put.status, 200);
  assert.equal((await put.json()).block.summary, '手改后的摘要');
  const row = ctx.sandbox.db.prepare('SELECT summary, topic, edited_at FROM context_blocks WHERE id = ?').get(block.id);
  assert.equal(row.summary, '手改后的摘要');
  assert.equal(row.topic, '交接');
  assert.ok(row.edited_at > 0);

  assert.equal((await ctx.request(`/api/sessions/${session.id}/context/blocks/${block.id}`, { method: 'PUT', ...json({ summary: '  ' }) })).status, 400);
  assert.equal((await ctx.request(`/api/sessions/${session.id}/context/blocks/${stale.id}/source`)).status, 404);
  assert.equal((await ctx.request(`/api/sessions/${session.id}/context/blocks/missing`, { method: 'DELETE' })).status, 404);
});

test('DELETE /context/blocks/:id 恢复原文：块删除，这几轮回到正文，基线记为恢复后的可见量', async () => {
  const session = insertSession(ctx.sandbox.db);
  seedRounds(session.id, 4);
  const block = insertContextBlock(ctx.sandbox.db, session.id, { from_round: 1, to_round: 2 });
  const res = await ctx.request(`/api/sessions/${session.id}/context/blocks/${block.id}`, { method: 'DELETE' });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.blocks, []);
  assert.equal(body.stats.rawRounds, 4);
  assert.equal(ctx.sandbox.db.prepare('SELECT COUNT(*) AS n FROM context_blocks WHERE session_id = ?').get(session.id).n, 0);
  const state = ctx.sandbox.db.prepare('SELECT last_outcome, baseline_tokens FROM context_state WHERE session_id = ?').get(session.id);
  assert.equal(state.last_outcome, 'restored');
  assert.ok(state.baseline_tokens > 0);
});

test('GET /context/search 在块摘要与原文轮次里检索，标出原文是否在正文里；空检索词 400', async () => {
  const session = insertSession(ctx.sandbox.db);
  seedRounds(session.id, 4);
  insertContextBlock(ctx.sandbox.db, session.id, { from_round: 1, to_round: 2, summary: '林遥收下罗盘，答应开春前归还' });
  const body = await (await ctx.request(`/api/sessions/${session.id}/context/search?q=${encodeURIComponent('青铜罗盘')}`)).json();
  const kinds = body.hits.map((h) => [h.kind, h.fromRound, h.inView ?? null]);
  assert.deepEqual(kinds.slice(0, 2).sort(), [['block', 1, null], ['round', 2, false]].sort());
  assert.equal((await ctx.request(`/api/sessions/${session.id}/context/search?q=`)).status, 400);
});
