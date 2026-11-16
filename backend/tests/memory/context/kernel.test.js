import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRoundUnits, digestOfRange, planEmergencyHide, protectedRounds, resolveView } from '../../../memory/context/view.js';
import { compressibleSegments, decideCompression, tierGroups } from '../../../memory/context/policy.js';
import { parseRef, planCompression } from '../../../memory/context/plan.js';
import { toPromptMessage } from '../../../utils/turn-dialogue.js';

/** 每轮一问一答；tokens[i] 控制第 i+1 轮回复的长度（每个汉字约 0.78 token） */
function makeMessages(count, { chars = () => 100, prefix = '' } = {}) {
  const messages = [];
  for (let round = 1; round <= count; round++) {
    messages.push({ id: `${prefix}u${round}`, role: 'user', content: `问${round}`, created_at: round * 10 });
    messages.push({ id: `${prefix}a${round}`, role: 'assistant', content: '字'.repeat(chars(round)), created_at: round * 10 + 1 });
  }
  return messages;
}

function unitsOf(messages, opts = {}) {
  return buildRoundUnits(messages, { toPromptMessage, ...opts });
}

function block(units, patch) {
  const from = patch.fromRound;
  const to = patch.toRound ?? from;
  return {
    id: patch.id,
    no: patch.no ?? 1,
    tier: patch.tier ?? 1,
    topic: '',
    summary: patch.summary ?? '摘要'.repeat(10),
    fromRound: from,
    toRound: to,
    sourceDigest: patch.sourceDigest ?? digestOfRange(units, from, to),
    rawTokens: patch.rawTokens ?? 100,
    consumedBy: patch.consumedBy ?? null,
    createdRound: patch.createdRound ?? to,
  };
}

// ─── view ───

test('buildRoundUnits：开场白并入第 1 轮，token 按去掉思考过程后的正文计，写作模式按消息位置标章节', () => {
  const messages = [
    { id: 'g', role: 'assistant', content: '开场白', created_at: 1 },
    { id: 'u1', role: 'user', content: '你好', created_at: 2 },
    { id: 'a1', role: 'assistant', content: '<think>很长很长的思考</think>回答', created_at: 3 },
    { id: 'u2', role: 'user', content: '继续', created_at: 4 },
  ];
  const units = unitsOf(messages, { scenes: new Map([[2, '码头']]), chapterMessageSize: 2 });
  assert.deepEqual(units.map((u) => [u.round, u.messages.length, u.scene, u.chapter]), [[1, 3, null, 1], [2, 1, '码头', 2]]);
  assert.equal(units[0].prompt[2].content, '回答');
  assert.ok(units[0].tokens < 10);
});

test('resolveView：块的来源指纹对得上时在用，原文被改动后失效并改用它吸收的子块，没有子块覆盖的轮次回到原文', () => {
  const messages = makeMessages(6);
  let units = unitsOf(messages);
  const b1 = block(units, { id: 'b1', no: 1, fromRound: 1, toRound: 2, consumedBy: 'b3' });
  const b2 = block(units, { id: 'b2', no: 2, fromRound: 3, toRound: 4, consumedBy: 'b3' });
  const b3 = block(units, { id: 'b3', no: 3, tier: 2, fromRound: 1, toRound: 4 });
  let view = resolveView([b1, b2, b3], units);
  assert.deepEqual(view.active.map((b) => b.id), ['b3']);
  assert.deepEqual(view.raw.map((u) => u.round), [5, 6]);

  // 第 4 轮的回复被编辑：b3 与 b2 失效，b1 重新在用，第 3、4 轮回到原文
  messages[7] = { ...messages[7], content: '改过的回复' };
  units = unitsOf(messages);
  view = resolveView([b1, b2, b3], units);
  assert.deepEqual(view.active.map((b) => b.id), ['b1']);
  assert.deepEqual(view.stale.sort(), ['b2', 'b3']);
  assert.deepEqual(view.raw.map((u) => u.round), [3, 4, 5, 6]);
});

test('resolveView：覆盖范围超出现存轮次的块失效；在用块重叠时保留起点更早的', () => {
  const units = unitsOf(makeMessages(4));
  const ghost = block(units, { id: 'ghost', fromRound: 3, toRound: 4, sourceDigest: 'x' });
  ghost.toRound = 9;
  const a = block(units, { id: 'a', no: 1, fromRound: 1, toRound: 2 });
  const b = block(units, { id: 'b', no: 2, fromRound: 2, toRound: 3 });
  const view = resolveView([a, b, ghost], units);
  assert.deepEqual(view.active.map((x) => x.id), ['a']);
  assert.deepEqual(view.stale.sort(), ['b', 'ghost']);
});

test('protectedRounds：最近三轮、不超过预算四成的更早轮次与当前场景的连续轮次受保护', () => {
  const scenes = new Map([[5, '城门'], [6, '城门'], [7, '酒馆'], [8, '酒馆'], [9, '酒馆'], [10, '酒馆']]);
  const units = unitsOf(makeMessages(10, { chars: () => 100 }), { scenes });
  const tokens = units[0].tokens;
  // 预算让四成只放得下 4 轮：最近 3 轮 + 1 轮；当前场景（酒馆）往前到第 7 轮，预算七成放得下
  const budget = Math.ceil((tokens * 4) / 0.4);
  assert.deepEqual([...protectedRounds(units, { budget })].sort((a, b) => a - b), [7, 8, 9, 10]);
  // 场景从第 7 轮起；预算更大时保护到第 7 轮为止，换场景处不再往前
  assert.deepEqual([...protectedRounds(units, { budget: budget * 3 })].sort((a, b) => a - b).at(0), 1);
  // 很长的老轮次不会被预算四成拉进保护区
  const long = unitsOf(makeMessages(5, { chars: (r) => (r === 1 ? 5000 : 10) }));
  assert.ok(!protectedRounds(long, { budget: 1000 }).has(1));
});

test('planEmergencyHide：从最老的未保护原文起移出，直到够数，保护区不动', () => {
  const units = unitsOf(makeMessages(6));
  const hidden = planEmergencyHide(units, new Set([5, 6]), { overflowTokens: units[0].tokens * 2 });
  assert.deepEqual([...hidden], [1, 2]);
  assert.equal(planEmergencyHide(units, new Set([1, 2, 3, 4, 5, 6]), { overflowTokens: 10_000 }).size, 0);
});

// ─── policy ───

test('compressibleSegments：保护区与已压缩轮次切开连续段，换场景处再切但每段至少达到下限，尾段并回前一段', () => {
  const scenes = new Map([[1, '甲'], [2, '甲'], [3, '乙'], [4, '乙'], [5, '丙']]);
  const units = unitsOf(makeMessages(8, { chars: () => 300 }), { scenes });
  const raw = units.filter((u) => u.round !== 6);
  const segments = compressibleSegments(raw, new Set([8]));
  assert.deepEqual(segments.map((s) => [s.from, s.to]), [[1, 2], [3, 5], [7, 7]]);
});

test('tierGroups：同一级、首尾相接的老块成组，新块或中间夹原文时断开', () => {
  const units = unitsOf(makeMessages(20));
  const blocks = [
    block(units, { id: 'a', no: 1, fromRound: 1, toRound: 2, createdRound: 3 }),
    block(units, { id: 'b', no: 2, fromRound: 3, toRound: 4, createdRound: 5 }),
    block(units, { id: 'c', no: 3, fromRound: 5, toRound: 6, createdRound: 7 }),
    block(units, { id: 'd', no: 4, fromRound: 8, toRound: 9, createdRound: 10 }),
    block(units, { id: 'e', no: 5, fromRound: 10, toRound: 11, createdRound: 19 }),
  ];
  const groups = tierGroups(blocks, 14);
  assert.deepEqual(groups.map((g) => [g.blockIds, g.targetTier]), [[['a', 'b', 'c'], 2]]);
  const t3 = tierGroups([{ ...blocks[0], tier: 3 }, { ...blocks[1], tier: 3 }], 20);
  assert.equal(t3[0].targetTier, 3);
});

function decide(units, view, state, budget) {
  return decideCompression({ units, view, protectedSet: protectedRounds(view.raw, { budget }), state, budget });
}

test('decideCompression：原文超预算且比基线多出一个增长步长时才调用模型；放弃后要再增长一个步长', () => {
  const units = unitsOf(makeMessages(12, { chars: () => 200 }));
  const view = resolveView([], units);
  const total = view.raw.reduce((sum, u) => sum + u.tokens, 0);
  const budget = Math.floor(total / 2);

  const first = decide(units, view, { baselineTokens: 0 }, budget);
  assert.equal(first.run, true);
  assert.deepEqual(first.reasons, ['raw-over-budget']);
  assert.ok(first.segments.length > 0);

  const afterDecline = decide(units, view, { baselineTokens: total, lastOutcome: 'declined' }, budget);
  assert.equal(afterDecline.run, false);

  const underBudget = decide(units, view, { baselineTokens: 0 }, total + 1);
  assert.equal(underBudget.run, false);
  assert.deepEqual(underBudget.segments, []);
});

test('decideCompression：上一轮提示词接近上下文上限时忽略增长步长；压缩成功但仍超预算时按积压继续', () => {
  const units = unitsOf(makeMessages(12, { chars: () => 200 }));
  const view = resolveView([], units);
  const total = view.raw.reduce((sum, u) => sum + u.tokens, 0);
  const budget = Math.floor(total / 2);
  const pressured = decide(units, view, { baselineTokens: total, lastPromptTokens: 80, contextLimit: 100 }, budget);
  assert.equal(pressured.run, true);
  assert.equal(pressured.pressure, true);
  const backlog = decide(units, view, { baselineTokens: total, lastOutcome: 'compressed' }, budget);
  assert.equal(backlog.run, true);
  assert.ok(backlog.reasons.includes('backlog'));
});

test('decideCompression：可见量回落（回退、恢复原文）时基线随之下调', () => {
  const units = unitsOf(makeMessages(3));
  const view = resolveView([], units);
  const result = decide(units, view, { baselineTokens: 999_999 }, 100_000);
  assert.equal(result.reference, result.visibleTokens);
});

test('decideCompression：摘要总量超上限时从最老的块组起建议提炼，够回落到低水位即止', () => {
  const units = unitsOf(makeMessages(40, { chars: () => 50 }));
  const blocks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => block(units, {
    id: `b${i}`, no: i, fromRound: i * 2 - 1, toRound: i * 2, createdRound: i * 2, summary: '要'.repeat(90),
  }));
  const view = resolveView(blocks, units);
  const result = decide(units, view, { baselineTokens: 0 }, 1000);
  assert.ok(result.reasons.includes('summary-over-budget'));
  assert.ok(result.summaryTokens > 600);
  // 每组至多 4 个块；只取到预计能回落到低水位（600 × 0.75）的最老几组
  assert.deepEqual(result.merges.map((m) => m.blockNos), [[1, 2, 3, 4], [5, 6, 7, 8]]);
});

test('decideCompression：摘要没超上限时不建议提炼，即使有相邻老块', () => {
  const units = unitsOf(makeMessages(40, { chars: () => 50 }));
  const blocks = [1, 2, 3].map((i) => block(units, {
    id: `b${i}`, no: i, fromRound: i * 2 - 1, toRound: i * 2, createdRound: i * 2, summary: '要'.repeat(60),
  }));
  const result = decide(units, resolveView(blocks, units), { baselineTokens: 0 }, 1000);
  assert.deepEqual(result.merges, []);
});

test('decideCompression：压力下模型放弃或失败后冷却几轮，期间只按增长门槛判断', () => {
  const units = unitsOf(makeMessages(12, { chars: () => 200 }));
  const view = resolveView([], units);
  const visible = view.raw.reduce((sum, u) => sum + u.tokens, 0);
  const budget = Math.floor(visible / 2);
  const pressured = { baselineTokens: visible, lastPromptTokens: 80, contextLimit: 100 };
  assert.equal(decide(units, view, pressured, budget).run, true, '压力下不看增长');
  const cooling = decide(units, view, { ...pressured, lastOutcome: 'failed', lastRunRound: 11 }, budget);
  assert.deepEqual([cooling.pressure, cooling.run], [false, false]);
  const retried = decide(units, view, { ...pressured, lastOutcome: 'declined', lastRunRound: 9 }, budget);
  assert.deepEqual([retried.pressure, retried.run], [true, true]);
});

test('decideCompression：连续没写入 n 次后增长步长乘以 2^min(n, 3)，封顶 8 倍', () => {
  const units = unitsOf(makeMessages(12, { chars: () => 200 }));
  const view = resolveView([], units);
  const visible = view.raw.reduce((sum, u) => sum + u.tokens, 0);
  const budget = Math.floor(visible / 4);
  const step = budget * 0.25;
  // 可见量比基线多出 gap 个步长：streak 为 n 时要多出 2^min(n,3) 个步长才放行
  const runs = (gap, streak) => decide(units, view, { baselineTokens: visible - gap * step, lastOutcome: 'declined', noWriteStreak: streak }, budget).run;
  assert.deepEqual([runs(1.5, 0), runs(1.5, 1)], [true, false]);
  assert.deepEqual([runs(2.5, 1), runs(2.5, 2)], [true, false]);
  assert.deepEqual([runs(4.5, 2), runs(4.5, 3)], [true, false]);
  assert.deepEqual([runs(8.5, 3), runs(8.5, 4), runs(8.5, 50)], [true, true, true]);
  assert.deepEqual([runs(7.5, 3), runs(7.5, 50)], [false, false], '封顶 8 倍，不会无限拉长');
  assert.equal(decide(units, view, { baselineTokens: visible - 8.5 * step, lastOutcome: 'compressed', noWriteStreak: 0 }, budget).backoff, 1);
});

test('decideCompression：压力冷却轮数同样乘以退避倍数', () => {
  const units = unitsOf(makeMessages(12, { chars: () => 200 }));
  const view = resolveView([], units);
  const visible = view.raw.reduce((sum, u) => sum + u.tokens, 0);
  const budget = Math.floor(visible / 2);
  const state = (lastRunRound, noWriteStreak) => ({
    baselineTokens: visible, lastPromptTokens: 80, contextLimit: 100, lastOutcome: 'failed', lastRunRound, noWriteStreak,
  });
  // 最新一轮是 12：streak 0 冷却 3 轮，streak 1 冷却 6 轮，streak 3 及以上冷却 24 轮
  assert.equal(decide(units, view, state(9, 0), budget).pressure, true);
  assert.equal(decide(units, view, state(9, 1), budget).pressure, false);
  assert.equal(decide(units, view, state(6, 1), budget).pressure, true);
  assert.equal(decide(units, view, state(-11, 3), budget).pressure, false);
  assert.equal(decide(units, view, state(-12, 9), budget).pressure, true);
});

// ─── plan ───

test('parseRef：认「第N轮」「N」「RN」「#N」与「bN」，其余返回 null', () => {
  assert.deepEqual(parseRef('第12轮'), { kind: 'round', round: 12 });
  assert.deepEqual(parseRef('R3'), { kind: 'round', round: 3 });
  assert.deepEqual(parseRef(' 7 '), { kind: 'round', round: 7 });
  assert.deepEqual(parseRef('#2'), { kind: 'round', round: 2 });
  assert.deepEqual(parseRef('b5'), { kind: 'block', no: 5 });
  assert.equal(parseRef('第3–9轮'), null);
  assert.equal(parseRef(undefined), null);
});

function planCtx(units, blocks = [], protectedList = [], shown = null) {
  return { units, view: resolveView(blocks, units), protectedSet: new Set(protectedList), shownRounds: shown && new Set(shown) };
}

const GOOD = '甲乙二人在码头立下约定，三日后于旧灯塔交接青铜罗盘。未了：交接罗盘（第2轮）';

test('planCompression：原文范围写成一级块；伸进保护区时拒绝并告诉模型能压到第几轮', () => {
  const units = unitsOf(makeMessages(8, { chars: () => 400 }));
  const ok = planCompression([{ start: '第1轮', end: '第5轮', topic: '码头', summary: GOOD }], planCtx(units, [], [6, 7, 8]));
  assert.deepEqual(ok.planned.map((b) => [b.tier, b.fromRound, b.toRound, b.topic]), [[1, 1, 5, '码头']]);
  assert.equal(ok.planned[0].rawTokens, units.slice(0, 5).reduce((sum, u) => sum + u.tokens, 0));

  const intrudes = planCompression([{ start: '第1轮', end: '第7轮', summary: GOOD }], planCtx(units, [], [6, 7, 8]));
  assert.deepEqual(intrudes.planned, [], '摘要按第1–7轮写的，不能截短后当成第1–5轮的摘要');
  assert.match(intrudes.errors[0], /从第6轮起是保护区.*改到第5轮为止/);
  const inside = planCompression([{ start: '第6轮', end: '第7轮', summary: GOOD }], planCtx(units, [], [6, 7, 8]));
  assert.match(inside.errors[0], /在保护区内/);
});

test('planCompression：包含已压缩轮次、没提供原文、范围太短的单条报错，不影响同批其他范围', () => {
  const units = unitsOf(makeMessages(10, { chars: (r) => (r === 9 ? 10 : 400) }));
  const covered = block(units, { id: 'x', no: 4, fromRound: 1, toRound: 2 });
  const result = planCompression([
    { start: '第2轮', end: '第3轮', summary: GOOD },
    { start: '第4轮', end: '第5轮', summary: GOOD },
    { start: '第6轮', end: '第6轮', summary: GOOD },
    { start: '第9轮', end: '第9轮', summary: GOOD },
  ], planCtx(units, [covered], [], [3, 4, 5, 7, 8, 9, 10]));
  assert.deepEqual(result.planned.map((b) => [b.fromRound, b.toRound]), [[4, 5]]);
  assert.equal(result.errors.length, 3);
  assert.match(result.errors[0], /第2轮已在块 b4 里/);
  assert.match(result.errors[1], /第6轮这次没有提供原文/);
  assert.match(result.errors[2], /太短/);
});

test('planCompression：两边都是块或保护区的孤立短段可以整段压缩', () => {
  const units = unitsOf(makeMessages(5, { chars: (r) => (r === 3 ? 200 : 400) }));
  const blocks = [block(units, { id: 'a', no: 1, fromRound: 1, toRound: 2 })];
  const result = planCompression([{ start: '3', end: '3', summary: '短短一轮：甲向乙借了二两银子，约定月底归还。' }], planCtx(units, blocks, [4, 5]));
  assert.deepEqual(result.planned.map((b) => [b.fromRound, b.toRound]), [[3, 3]]);
});

test('planCompression：块范围提炼成上一级，吸收范围内全部在用块；中间夹原文或只有一个块时报错', () => {
  const units = unitsOf(makeMessages(10, { chars: () => 400 }));
  const blocks = [
    block(units, { id: 'a', no: 1, fromRound: 1, toRound: 2, summary: '一'.repeat(300) }),
    block(units, { id: 'b', no: 2, fromRound: 3, toRound: 4, tier: 2, summary: '二'.repeat(300) }),
    block(units, { id: 'c', no: 3, fromRound: 6, toRound: 7, summary: '三'.repeat(300) }),
  ];
  const ok = planCompression([{ start: 'b1', end: 'b2', summary: GOOD }], planCtx(units, blocks));
  assert.deepEqual(ok.planned.map((b) => [b.tier, b.fromRound, b.toRound, b.consumes]), [[2, 1, 4, ['a', 'b']]]);
  const gap = planCompression([{ start: 'b2', end: 'b3', summary: GOOD }], planCtx(units, blocks));
  assert.match(gap.errors[0], /夹着原文轮次/);
  const single = planCompression([{ start: 'b3', end: 'b3', summary: GOOD }], planCtx(units, blocks));
  assert.match(single.errors[0], /只含一个块/);
  const mixed = planCompression([{ start: 'b1', end: '第4轮', summary: GOOD }], planCtx(units, blocks));
  assert.match(mixed.errors[0], /要么都是轮次、要么都是块/);
});

test('planCompression：摘要太短、太长或不比来源短时只拒绝该条，其余范围照常通过', () => {
  const units = unitsOf(makeMessages(10, { chars: () => 400 }));
  const tooLong = planCompression([
    { start: '1', end: '2', summary: GOOD },
    { start: '3', end: '4', summary: '长'.repeat(801) },
  ], planCtx(units));
  assert.deepEqual(tooLong.planned.map((b) => [b.fromRound, b.toRound]), [[1, 2]]);
  assert.match(tooLong.errors[0], /第3–4轮.*超过 800 字|超过 800 字/);
  const short = planCompression([{ start: '1', end: '2', summary: '太短' }, { start: '1', end: '2', summary: GOOD }], planCtx(units));
  assert.match(short.errors[0], /少于/);
  assert.deepEqual(short.planned.map((b) => [b.fromRound, b.toRound]), [[1, 2]], '没通过的范围不占位，后面同范围的正确提交照常通过');
  const small = unitsOf(makeMessages(4, { chars: () => 40 }));
  const notShorter = planCompression([{ start: '1', end: '4', summary: '字'.repeat(200) }], planCtx(small));
  assert.match(notShorter.errors[0], /没有起到压缩作用/);
});

test('planCompression：同一批后面的范围与前面重叠时跳过并提示', () => {
  const units = unitsOf(makeMessages(10, { chars: () => 400 }));
  const result = planCompression([
    { start: '1', end: '4', summary: GOOD },
    { start: '3', end: '6', summary: GOOD },
  ], planCtx(units));
  assert.deepEqual(result.planned.map((b) => [b.fromRound, b.toRound]), [[1, 4]]);
  assert.match(result.warnings[0], /重叠/);
});
