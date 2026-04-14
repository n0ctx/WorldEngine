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
import { deleteEntry } from '../utils/vector-store.js';
import * as sessionSummaryVectorStore from '../utils/session-summary-vector-store.js';

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

import {
  getEmbeddingIdsByCharacterId,
  getEmbeddingIdsByWorldId,
} from '../db/queries/prompt-entries.js';

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

// ── Prompt 条目向量 ───────────────────────────────────────────────
// 模块：prompt-entries — 管理 data/vectors/prompt_entries.json

registerOnDelete('character', async (cid) => {
  for (const eid of getEmbeddingIdsByCharacterId(cid)) {
    deleteEntry(eid);
  }
});

registerOnDelete('world', async (wid) => {
  for (const eid of getEmbeddingIdsByWorldId(wid)) {
    deleteEntry(eid);
  }
});

// ── Session Summary 向量 ─────────────────────────────────────────
// 模块：summary-embedder — 管理 data/vectors/session_summaries.json

registerOnDelete('session', async (sid) => {
  sessionSummaryVectorStore.deleteBySessionId(sid);
});

registerOnDelete('character', async (cid) => {
  for (const sid of getSessionIdsByCharacterId(cid)) {
    sessionSummaryVectorStore.deleteBySessionId(sid);
  }
});

registerOnDelete('world', async (wid) => {
  for (const sid of getSessionIdsByWorldId(wid)) {
    sessionSummaryVectorStore.deleteBySessionId(sid);
  }
});
