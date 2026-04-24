/**
 * diary-generator.test.js
 *
 * 测试日记生成模块的核心逻辑：
 *   - 纯函数：parseVirtualDate / formatDateStr / formatDateDisplay
 *   - checkAndGenerateDiary：跳过条件 + 跨日生成（虚拟/真实日期）
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createTestSandbox, freshImport, resetMockEnv } from '../helpers/test-env.js';
import { insertSession, insertMessage, insertTurnRecord, insertWorld } from '../helpers/fixtures.js';

// ── 沙盒 ───────────────────────────────────────────────────────────────
const sandbox = createTestSandbox('diary-generator-suite');

before(() => {
  sandbox.setEnv();
  // 让 diary-generator.js 把文件写到沙盒目录，而非真实 data/
  process.env.WE_DATA_DIR = sandbox.root;
});

after(() => {
  resetMockEnv();
  delete process.env.WE_DATA_DIR;
  sandbox.cleanup();
});

// ── 帮助函数 ────────────────────────────────────────────────────────────

/** 构造 state_snapshot JSON，_diary_time 值为 runtime_value_json（即 JSON 编码的字符串） */
function makeSnapshot(dateStr) {
  if (!dateStr) return null;
  return JSON.stringify({ world: { 'diary_time': JSON.stringify(dateStr) } });
}

/** 创建一对 user+assistant 消息，并插入 turn_record 记录 */
function makeRound(db, sessionId, { round_index, userContent, asstContent, snapshot, created_at }) {
  const user = insertMessage(db, sessionId, { role: 'user', content: userContent, created_at: created_at ?? round_index * 100 });
  const asst = insertMessage(db, sessionId, { role: 'assistant', content: asstContent, created_at: (created_at ?? round_index * 100) + 1 });
  const rec = insertTurnRecord(db, sessionId, {
    round_index,
    summary: `第${round_index}轮`,
    user_message_id: user.id,
    asst_message_id: asst.id,
    state_snapshot: snapshot ?? null,
    created_at: created_at ?? round_index * 100,
  });
  return { user, asst, rec };
}

// ═══════════════════════════════════════════════════════════════════════
// § 1  纯函数测试
// ═══════════════════════════════════════════════════════════════════════

test('parseVirtualDate：正确解析 "N年N月N日N时N分" 格式', async () => {
  const { parseVirtualDate } = await freshImport('backend/memory/diary-generator.js');
  const result = parseVirtualDate(JSON.stringify('1000年3月15日14时30分'));
  assert.deepEqual(result, { year: 1000, month: 3, day: 15 });
});

test('parseVirtualDate：兼容旧格式 "N年N月N日N时"', async () => {
  const { parseVirtualDate } = await freshImport('backend/memory/diary-generator.js');
  const result = parseVirtualDate(JSON.stringify('1000年3月15日14时'));
  assert.deepEqual(result, { year: 1000, month: 3, day: 15 });
});

test('parseVirtualDate：null/undefined 返回 null', async () => {
  const { parseVirtualDate } = await freshImport('backend/memory/diary-generator.js');
  assert.equal(parseVirtualDate(null), null);
  assert.equal(parseVirtualDate(undefined), null);
  assert.equal(parseVirtualDate(''), null);
});

test('parseVirtualDate：无效 JSON 返回 null', async () => {
  const { parseVirtualDate } = await freshImport('backend/memory/diary-generator.js');
  assert.equal(parseVirtualDate('not-json'), null);
});

test('parseVirtualDate：值不含年月日格式返回 null', async () => {
  const { parseVirtualDate } = await freshImport('backend/memory/diary-generator.js');
  assert.equal(parseVirtualDate(JSON.stringify('今天天气很好')), null);
  assert.equal(parseVirtualDate(JSON.stringify(123)), null);
});

test('formatDateStr：补零并生成 YYYY-MM-DD', async () => {
  const { formatDateStr } = await freshImport('backend/memory/diary-generator.js');
  assert.equal(formatDateStr({ year: 1000, month: 3, day: 5 }), '1000-03-05');
  assert.equal(formatDateStr({ year: 42, month: 12, day: 31 }), '0042-12-31');
});

test('formatDateDisplay：生成中文显示日期', async () => {
  const { formatDateDisplay } = await freshImport('backend/memory/diary-generator.js');
  assert.equal(formatDateDisplay({ year: 1000, month: 3, day: 5 }), '1000年3月5日');
  assert.equal(formatDateDisplay({ year: 42, month: 12, day: 31 }), '42年12月31日');
});

test('checkAndGenerateDiary：摘要提取会清洗模板标签', async () => {
  resetMockEnv();
  const diaryBody = '# 1000年3月15日\n\n{{摘要：今日冒险圆满结束。}}\n\n---\n\n{{正文：一段详细正文。}}';
  process.env.MOCK_LLM_COMPLETE = diaryBody;

  const world = insertWorld(sandbox.db);
  const session = insertSession(sandbox.db, { world_id: world.id, diary_date_mode: 'virtual' });

  const snap1 = makeSnapshot('1000年3月15日14时');
  const snap2 = makeSnapshot('1000年3月16日8时');

  makeRound(sandbox.db, session.id, { round_index: 1, userContent: '第一天的探索', asstContent: '你踏入了森林。', snapshot: snap1 });
  makeRound(sandbox.db, session.id, { round_index: 2, userContent: '新的一天', asstContent: '黎明破晓。', snapshot: snap2 });

  const { checkAndGenerateDiary } = await freshImport('backend/memory/diary-generator.js');
  await checkAndGenerateDiary(session.id, 2);

  const entry = sandbox.db.prepare(
    'SELECT * FROM daily_entries WHERE session_id = ? AND date_str = ?'
  ).get(session.id, '1000-03-15');
  assert.ok(entry, 'daily_entries 表应有记录');
  assert.equal(entry.summary, '今日冒险圆满结束。');
});

// ═══════════════════════════════════════════════════════════════════════
// § 2  checkAndGenerateDiary — 跳过条件
// ═══════════════════════════════════════════════════════════════════════

test('checkAndGenerateDiary：roundIndex <= 1 时跳过（不访问 DB）', async () => {
  resetMockEnv();
  const { checkAndGenerateDiary } = await freshImport('backend/memory/diary-generator.js');
  // 不存在的 sessionId，若访问 DB 会返回 null 但不会抛出；roundIndex=1 应在查询前就返回
  await assert.doesNotReject(() => checkAndGenerateDiary('nonexistent-session', 1));
});

test('checkAndGenerateDiary：diary_date_mode 为 null 时跳过', async () => {
  resetMockEnv();
  const world = insertWorld(sandbox.db);
  const session = insertSession(sandbox.db, { world_id: world.id, diary_date_mode: null });
  makeRound(sandbox.db, session.id, { round_index: 1, userContent: 'u1', asstContent: 'a1' });
  makeRound(sandbox.db, session.id, { round_index: 2, userContent: 'u2', asstContent: 'a2' });

  const { checkAndGenerateDiary } = await freshImport('backend/memory/diary-generator.js');
  await checkAndGenerateDiary(session.id, 2);

  // 不应生成任何文件
  const dailyDir = path.join(sandbox.root, 'daily', session.id);
  assert.equal(fs.existsSync(dailyDir), false, '日记目录不应存在');
});

test('checkAndGenerateDiary：虚拟日期相同时不生成日记', async () => {
  resetMockEnv();
  const world = insertWorld(sandbox.db);
  const session = insertSession(sandbox.db, { world_id: world.id, diary_date_mode: 'virtual' });
  const snap = makeSnapshot('1000年3月15日');
  makeRound(sandbox.db, session.id, { round_index: 1, userContent: 'u1', asstContent: 'a1', snapshot: snap });
  makeRound(sandbox.db, session.id, { round_index: 2, userContent: 'u2', asstContent: 'a2', snapshot: snap });

  const { checkAndGenerateDiary } = await freshImport('backend/memory/diary-generator.js');
  await checkAndGenerateDiary(session.id, 2);

  const dailyDir = path.join(sandbox.root, 'daily', session.id);
  assert.equal(fs.existsSync(dailyDir), false, '日期未跨越，不应生成日记');
});

test('checkAndGenerateDiary：虚拟日期缺失时跳过', async () => {
  resetMockEnv();
  const world = insertWorld(sandbox.db);
  const session = insertSession(sandbox.db, { world_id: world.id, diary_date_mode: 'virtual' });
  // state_snapshot 中无 _diary_time
  const noTimesnap = JSON.stringify({ world: { other_field: '"value"' } });
  makeRound(sandbox.db, session.id, { round_index: 1, userContent: 'u1', asstContent: 'a1', snapshot: noTimesnap });
  makeRound(sandbox.db, session.id, { round_index: 2, userContent: 'u2', asstContent: 'a2', snapshot: noTimesnap });

  const { checkAndGenerateDiary } = await freshImport('backend/memory/diary-generator.js');
  await checkAndGenerateDiary(session.id, 2);

  const dailyDir = path.join(sandbox.root, 'daily', session.id);
  assert.equal(fs.existsSync(dailyDir), false, '无日期字段，不应生成');
});

// ═══════════════════════════════════════════════════════════════════════
// § 3  checkAndGenerateDiary — 跨日生成（虚拟日期）
// ═══════════════════════════════════════════════════════════════════════

test('checkAndGenerateDiary：虚拟日期跨日时生成日记文件 + DB 条目', async () => {
  resetMockEnv();
  // LLM 模拟返回日记正文
  const diaryBody = '# 1000年3月15日\n\n今日冒险圆满结束。\n\n---\n\n一段详细正文。';
  process.env.MOCK_LLM_COMPLETE = diaryBody;

  const world = insertWorld(sandbox.db);
  const session = insertSession(sandbox.db, { world_id: world.id, diary_date_mode: 'virtual' });

  const snap1 = makeSnapshot('1000年3月15日14时');
  const snap2 = makeSnapshot('1000年3月16日8时');

  makeRound(sandbox.db, session.id, { round_index: 1, userContent: '第一天的探索', asstContent: '你踏入了森林。', snapshot: snap1 });
  makeRound(sandbox.db, session.id, { round_index: 2, userContent: '新的一天', asstContent: '黎明破晓。', snapshot: snap2 });

  const { checkAndGenerateDiary } = await freshImport('backend/memory/diary-generator.js');
  await checkAndGenerateDiary(session.id, 2);

  // 验证文件已写入
  const filePath = path.join(sandbox.root, 'daily', session.id, '1000-03-15.md');
  assert.ok(fs.existsSync(filePath), '日记文件应存在');
  const content = fs.readFileSync(filePath, 'utf-8');
  assert.equal(content, diaryBody);

  // 验证 DB 条目已写入
  const entry = sandbox.db.prepare(
    'SELECT * FROM daily_entries WHERE session_id = ? AND date_str = ?'
  ).get(session.id, '1000-03-15');
  assert.ok(entry, 'daily_entries 表应有记录');
  assert.equal(entry.date_display, '1000年3月15日');
  assert.equal(entry.summary, '今日冒险圆满结束。');
  assert.equal(entry.triggered_by_round_index, 2);
});

// ═══════════════════════════════════════════════════════════════════════
// § 4  checkAndGenerateDiary — LLM 失败时静默跳过
// ═══════════════════════════════════════════════════════════════════════

test('checkAndGenerateDiary：LLM 失败时不抛出且不写文件', async () => {
  resetMockEnv();
  process.env.MOCK_LLM_COMPLETE_ERROR = '模拟 LLM 错误';

  const world = insertWorld(sandbox.db);
  const session = insertSession(sandbox.db, { world_id: world.id, diary_date_mode: 'virtual' });
  const snap1 = makeSnapshot('1000年4月1日14时');
  const snap2 = makeSnapshot('1000年4月2日8时');
  makeRound(sandbox.db, session.id, { round_index: 1, userContent: 'u', asstContent: 'a', snapshot: snap1 });
  makeRound(sandbox.db, session.id, { round_index: 2, userContent: 'u2', asstContent: 'a2', snapshot: snap2 });

  const { checkAndGenerateDiary } = await freshImport('backend/memory/diary-generator.js');
  await assert.doesNotReject(() => checkAndGenerateDiary(session.id, 2));

  const filePath = path.join(sandbox.root, 'daily', session.id, '1000-04-01.md');
  assert.equal(fs.existsSync(filePath), false, 'LLM 失败不应写文件');
});

// ═══════════════════════════════════════════════════════════════════════
// § 5  checkAndGenerateDiary — 真实日期模式
// ═══════════════════════════════════════════════════════════════════════

test('checkAndGenerateDiary：真实日期相同时不生成', async () => {
  resetMockEnv();
  const world = insertWorld(sandbox.db);
  const session = insertSession(sandbox.db, { world_id: world.id, diary_date_mode: 'real' });

  // 两轮用同一毫秒时间戳（同一天）
  const ts = new Date('2024-01-15T10:00:00+08:00').getTime();
  makeRound(sandbox.db, session.id, { round_index: 1, userContent: 'u', asstContent: 'a', created_at: ts });
  makeRound(sandbox.db, session.id, { round_index: 2, userContent: 'u2', asstContent: 'a2', created_at: ts + 1000 });

  const { checkAndGenerateDiary } = await freshImport('backend/memory/diary-generator.js');
  await checkAndGenerateDiary(session.id, 2);

  const dailyDir = path.join(sandbox.root, 'daily', session.id);
  assert.equal(fs.existsSync(dailyDir), false, '真实日期同天不应生成');
});

test('checkAndGenerateDiary：真实日期跨日时生成日记', async () => {
  resetMockEnv();
  const diaryBody = '# 2024年1月15日\n\n今日任务完成。\n\n---\n\n详细记录。';
  process.env.MOCK_LLM_COMPLETE = diaryBody;

  const world = insertWorld(sandbox.db);
  const session = insertSession(sandbox.db, { world_id: world.id, diary_date_mode: 'real' });

  const ts1 = new Date('2024-01-15T10:00:00+08:00').getTime();
  const ts2 = new Date('2024-01-16T09:00:00+08:00').getTime();
  makeRound(sandbox.db, session.id, { round_index: 1, userContent: '昨天', asstContent: '昨天发生了...', created_at: ts1 });
  makeRound(sandbox.db, session.id, { round_index: 2, userContent: '今天', asstContent: '新的一天...', created_at: ts2 });

  const { checkAndGenerateDiary } = await freshImport('backend/memory/diary-generator.js');
  await checkAndGenerateDiary(session.id, 2);

  // 文件名为真实日期（2024-01-15）
  const filePath = path.join(sandbox.root, 'daily', session.id, '2024-01-15.md');
  assert.ok(fs.existsSync(filePath), '真实日期跨日应生成日记文件');

  const entry = sandbox.db.prepare(
    'SELECT * FROM daily_entries WHERE session_id = ? AND date_str = ?'
  ).get(session.id, '2024-01-15');
  assert.ok(entry, 'DB 应有条目');
  assert.equal(entry.triggered_by_round_index, 2);
});
