import { useState } from 'react';
import { getSessions, createSession } from '../../../core/api/sessions';
import { createWritingSession } from '../../../core/api/writing-sessions';
import { log } from '../../../core/utils/logger.js';
import { useOpenStoryline, deleteStoryline } from '../../../core/hooks/storyline.js';

// ── 故事线：打开已有条目 / 新建写作 / 点角色进入对话 / 和角色开新对话 / 删除 ──────

export function useStorylineActions(worldId, navigate, setCurrentWritingSessionId, setTimeline) {
  const handleStorylineClick = useOpenStoryline(worldId);
  const [deletingStoryline, setDeletingStoryline] = useState(null);

  async function handleCreateStoryline() {
    try {
      const session = await createWritingSession(worldId);
      setCurrentWritingSessionId(session.id);
      navigate(`/worlds/${worldId}/writing`);
    } catch (err) {
      log.error('storyline.create_failed', err, { toast: `创建失败：${err.message}` });
    }
  }

  // 点角色进入对话：有会话就回到最近一条，没有才新建（新建会自动带上开场白）
  async function handleCharacterChat(character) {
    try {
      const [latest] = await getSessions(character.id, 1);
      const session = latest || await createSession(character.id);
      handleStorylineClick({ mode: 'chat', id: session.id, character_id: character.id });
    } catch (err) {
      log.error('storyline.chat_open_failed', err, { toast: `进入对话失败：${err.message}` });
    }
  }

  // 角色卡上的「新对话」：不管有没有旧会话都新开一条
  async function handleCharacterNewChat(character) {
    try {
      const session = await createSession(character.id);
      handleStorylineClick({ mode: 'chat', id: session.id, character_id: character.id });
    } catch (err) {
      log.error('storyline.create_failed', err, { toast: `创建失败：${err.message}` });
    }
  }

  async function handleDeleteStoryline() {
    const item = deletingStoryline;
    try {
      await deleteStoryline(worldId, item);
      setTimeline((prev) => prev.filter((it) => it.id !== item.id));
    } catch (err) {
      log.error('storyline.delete_failed', err, { toast: `删除失败：${err.message}` });
    }
    setDeletingStoryline(null);
  }

  return {
    handleStorylineClick,
    handleCreateStoryline,
    handleCharacterChat,
    handleCharacterNewChat,
    deletingStoryline,
    setDeletingStoryline,
    handleDeleteStoryline,
  };
}
