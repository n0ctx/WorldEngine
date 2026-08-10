import crypto from 'node:crypto';
import db from '../index.js';
import { extractPreviewText } from '../../utils/text-preview.js';

/**
 * 创建会话，title 默认 NULL
 * @param {string} characterId
 * @param {{ diary_date_mode?: string|null }} [opts]
 */
export function createSession(characterId, { diary_date_mode = null } = {}) {
  const id = crypto.randomUUID();
  const now = Date.now();
  db.prepare(`
    INSERT INTO sessions (id, character_id, title, diary_date_mode, created_at, updated_at)
    VALUES (?, ?, NULL, ?, ?, ?)
  `).run(id, characterId, diary_date_mode, now, now);
  return getSessionById(id);
}

/**
 * 根据 id 获取单个会话
 */
export function getSessionById(id) {
  return db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
}

/**
 * 取会话的首轮前状态基线快照（JSON 字符串或 null）。
 */
export function getSessionStateBaseline(id) {
  return db.prepare('SELECT state_baseline_json FROM sessions WHERE id = ?').get(id)?.state_baseline_json ?? null;
}

/**
 * 仅在基线尚未写入时落盘（不可变）。已有基线则原样保留，避免被后续轮次/重生成污染覆盖。
 * @returns {boolean} 本次是否实际写入
 */
export function setSessionStateBaselineIfAbsent(id, baselineJson) {
  const r = db.prepare(
    "UPDATE sessions SET state_baseline_json = ? WHERE id = ? AND state_baseline_json IS NULL",
  ).run(baselineJson, id);
  return r.changes > 0;
}

/**
 * 取某 persona 名下所有 writing 模式会话的 id 列表。
 */
export function getWritingSessionIdsByPersonaId(personaId) {
  return db.prepare(
    "SELECT id FROM sessions WHERE persona_id = ? AND mode = 'writing'",
  ).all(personaId);
}

/**
 * 获取某角色下的会话列表，按 updated_at 降序，支持分页
 */
export function getSessionsByCharacterId(characterId, limit = 20, offset = 0) {
  return db.prepare(
    'SELECT * FROM sessions WHERE character_id = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?',
  ).all(characterId, limit, offset);
}

/**
 * 获取某世界最近更新的一条 chat 会话
 */
export function getLatestChatSessionByWorldId(worldId) {
  return db.prepare(`
    SELECT s.*
    FROM sessions s
    JOIN characters c ON c.id = s.character_id
    WHERE c.world_id = ? AND s.mode = 'chat'
    ORDER BY s.updated_at DESC
    LIMIT 1
  `).get(worldId);
}

/**
 * 获取某世界最近更新的一条会话（不限 mode，跨 chat/writing）
 * chat 会话通过 character_id → characters.world_id 关联世界；
 * writing 会话直接挂 sessions.world_id。
 */
export function getLatestSessionByWorldId(worldId) {
  return db.prepare(`
    SELECT s.*
    FROM sessions s
    LEFT JOIN characters c ON c.id = s.character_id
    WHERE c.world_id = ? OR s.world_id = ?
    ORDER BY s.updated_at DESC
    LIMIT 1
  `).get(worldId, worldId);
}

const TIMELINE_SNIPPET_MAX_LEN = 60;
// 每个会话最多回溯多少条最近消息去找一条"洗干净后非空"的正文。
// 思考块/纯 markdown 装饰消息连续出现的情况极少，20 条足够兜底。
const TIMELINE_LOOKBACK_PER_SESSION = 20;

function truncateSnippet(text) {
  if (!text) return null;
  return text.length <= TIMELINE_SNIPPET_MAX_LEN
    ? text
    : `${text.slice(0, TIMELINE_SNIPPET_MAX_LEN)}…`;
}

/**
 * 获取某世界下的会话时间线：chat + writing 混编（不过滤 mode），按 updated_at 降序。
 * chat 会话通过 character_id → characters.world_id 关联世界；writing 会话直接挂 sessions.world_id。
 *
 * writing 会话按 persona 过滤：只显示 activePersonaId 这张玩家卡名下的写作会话，与
 * getActiveWritingSessionsByWorldId（写作页会话列表）保持一致的口径——写作会话本来就是
 * 「以某张玩家卡的视角」在写，混进其他玩家卡的会话会让时间线读起来串戏。
 * activePersonaId 为空（世界下还没有任何 persona）时，写作会话一条都不显示。
 * chat 会话不受此过滤（sessions.persona_id 对 chat 恒为 NULL）。
 *
 * 附带最后一条消息的预览文本：取会话里"最后一条消息"（不分角色——写作会话通常只有
 * user 一方，且用户自己写的正文本来就该展示），剥掉思考块和 markdown 标记后如果是空的
 * （典型情况：AI 最后一条消息整条都是 <think> 规划、没有正文），就回溯到更早一条消息，
 * 直到找到非空正文；一直没有就该会话不展示预览。不单独优先"最后一条 AI 正文"，
 * 因为那样会把用户刚发的最新一条晾在一边，时间线读起来会跳帧。
 */
export function getSessionsByWorldId(worldId, limit = 50, activePersonaId = null) {
  const rows = db.prepare(`
    SELECT s.id, s.mode, s.title, s.created_at, s.updated_at, s.character_id
    FROM sessions s
    LEFT JOIN characters c ON c.id = s.character_id
    WHERE (c.world_id = ? OR s.world_id = ?)
      AND (s.mode != 'writing' OR s.persona_id = ?)
    ORDER BY s.updated_at DESC
    LIMIT ?
  `).all(worldId, worldId, activePersonaId, limit);

  if (rows.length === 0) return rows;

  const sessionIds = rows.map((r) => r.id);
  const placeholders = sessionIds.map(() => '?').join(',');
  // 用窗口函数把每个会话截到最近 N 条，避免长会话把整表消息都拉出来。
  const messages = db.prepare(`
    SELECT session_id, content FROM (
      SELECT session_id, content,
        ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY created_at DESC, rowid DESC) AS rn
      FROM messages
      WHERE session_id IN (${placeholders})
    )
    WHERE rn <= ?
    ORDER BY session_id, rn
  `).all(...sessionIds, TIMELINE_LOOKBACK_PER_SESSION);

  const bySession = new Map();
  for (const m of messages) {
    if (!bySession.has(m.session_id)) bySession.set(m.session_id, []);
    bySession.get(m.session_id).push(m.content);
  }

  for (const row of rows) {
    const recentContents = bySession.get(row.id) || [];
    let preview = null;
    for (const content of recentContents) {
      preview = extractPreviewText(content);
      if (preview) break;
    }
    row.last_message = truncateSnippet(preview);
  }
  return rows;
}

/**
 * 更新会话标题
 */
export function updateSessionTitle(id, title) {
  db.prepare('UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?').run(title, Date.now(), id);
  return getSessionById(id);
}

/**
 * 更新会话的 updated_at（发送消息时调用）
 */
export function touchSession(id) {
  db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run(Date.now(), id);
}

/**
 * 清除 sessions.compressed_context（清空聊天记录时调用）
 * 注意：setCompressedContext 已删除（旧压缩系统废弃），此函数作为防御性清理保留，
 * 确保清空消息时同步置空旧数据库中可能残留的 compressed_context 字段值。
 */
export function clearCompressedContext(sessionId) {
  db.prepare('UPDATE sessions SET compressed_context = NULL, updated_at = ? WHERE id = ?')
    .run(Date.now(), sessionId);
}

/**
 * 硬删除会话
 */
export function deleteSession(id) {
  return db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
}
