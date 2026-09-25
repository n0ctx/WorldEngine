/**
 * cleanup-registrations.js — 所有副作用资源删除钩子的集中注册
 *
 * server.js 启动时 import 此文件（副作用 import），触发一次注册。
 * 之后每次 runOnDelete(entity, id) 都会执行已注册的钩子。
 *
 * 新增副作用资源（文件 / 向量 / 外部存储）时，只需在此文件注册新钩子，
 * 不改动 deleteWorld / deleteCharacter / deleteSession 等核心 delete 逻辑。
 */

import { registerOnDelete } from '../utils/cleanup-hooks.js';
import { unlinkUploadFile, unlinkUploadFiles } from '../utils/file-cleanup.js';
import * as sessionSummaryVectorStore from '../utils/session-summary-vector-store.js';
import * as turnSummaryVectorStore from '../utils/turn-summary-vector-store.js';
import { deleteDiaryDir } from '../memory/diary-generator.js';
import { deleteMemoryDir as deleteLongTermMemoryDir } from './long-term-memory.js';
import { deleteTableMemoryDir } from './table-memory.js';

import {
  getAttachmentsByMessageId,
  getAttachmentsBySessionId,
  getAttachmentsByCharacterId,
  getAttachmentsByWorldId,
} from '../db/queries/messages.js';

import {
  getCharacterById,
  getAvatarPathsByWorldId,
  getSessionIdsByCharacterId,
  getSessionIdsByWorldId,
} from '../db/queries/characters.js';

import { getPersonaAvatarPathByWorldId } from '../db/queries/personas.js';

// ── 消息附件文件 ──────────────────────────────────────────────────
// 模块：chat / messages — 管理 data/uploads/attachments/ 下的文件

registerOnDelete('message', async (mid) => {
  await unlinkUploadFiles(getAttachmentsByMessageId(mid));
});

registerOnDelete('session', async (sid) => {
  await unlinkUploadFiles(getAttachmentsBySessionId(sid));
});

registerOnDelete('character', async (cid) => {
  await unlinkUploadFiles(getAttachmentsByCharacterId(cid));
});

registerOnDelete('world', async (wid) => {
  await unlinkUploadFiles(getAttachmentsByWorldId(wid));
});

// ── 角色头像文件 ──────────────────────────────────────────────────
// 模块：characters — 管理 data/uploads/avatars/{characterId}.ext

registerOnDelete('character', async (cid) => {
  const ch = getCharacterById(cid);
  await unlinkUploadFile(ch?.avatar_path);
});

registerOnDelete('world', async (wid) => {
  for (const avatarPath of getAvatarPathsByWorldId(wid)) {
    await unlinkUploadFile(avatarPath);
  }
});

// ── 玩家头像文件 ──────────────────────────────────────────────────
// 模块：personas — 管理 data/uploads/avatars/persona-{personaId}.ext

registerOnDelete('world', async (wid) => {
  await unlinkUploadFile(getPersonaAvatarPathByWorldId(wid));
});


/** 按会话存放的资源：删会话时清一次；删角色 / 世界时对其下每个会话各清一次 */
function registerSessionScopedCleanup(cleanup) {
  registerOnDelete('session', async (sid) => {
    cleanup(sid);
  });
  registerOnDelete('character', async (cid) => {
    for (const sid of getSessionIdsByCharacterId(cid)) cleanup(sid);
  });
  registerOnDelete('world', async (wid) => {
    for (const sid of getSessionIdsByWorldId(wid)) cleanup(sid);
  });
}

// ── Session Summary 向量 ─────────────────────────────────────────
// 写路径已废弃（summary-embedder.js 已删除），清理钩子保留以处理旧数据

registerSessionScopedCleanup((sid) => sessionSummaryVectorStore.deleteBySessionId(sid));

// ── 日记文件目录 ─────────────────────────────────────────────────
// 模块：diary-generator — 管理 data/daily/{sessionId}/ 目录
// daily_entries 表由 ON DELETE CASCADE 自动清理；磁盘文件需手动删除

registerSessionScopedCleanup(deleteDiaryDir);

// ── 长期记忆文件目录 ─────────────────────────────────────────────
// 模块：long-term-memory — 管理 data/long_term_memory/{sessionId}/ 目录

registerSessionScopedCleanup(deleteLongTermMemoryDir);

// ── 表格记忆文件目录 ─────────────────────────────────────────────
// 模块：table-memory — 管理 data/table_memory/{sessionId}/ 目录

registerSessionScopedCleanup(deleteTableMemoryDir);

// ── Turn Summary 向量 ────────────────────────────────────────────
// 模块：turn-summarizer — 管理 data/vectors/turn_summaries.json
// turn_records 表由 ON DELETE CASCADE 自动清理；向量文件需手动清理

registerSessionScopedCleanup((sid) => turnSummaryVectorStore.deleteBySessionId(sid));
