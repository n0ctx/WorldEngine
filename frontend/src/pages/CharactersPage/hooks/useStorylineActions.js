import { createWritingSession } from '../../../core/api/writing-sessions';
import { log } from '../../../core/utils/logger.js';
import { useOpenStoryline } from '../../../core/hooks/storyline.js';

// ── 故事线：打开已有条目 / 新建写作 ────────────────────────────────────────

export function useStorylineActions(worldId, navigate, setCurrentWritingSessionId) {
  const handleStorylineClick = useOpenStoryline(worldId);

  async function handleCreateStoryline() {
    try {
      const session = await createWritingSession(worldId);
      setCurrentWritingSessionId(session.id);
      navigate(`/worlds/${worldId}/writing`);
    } catch (err) {
      log.error('storyline.create_failed', err, { toast: `创建失败：${err.message}` });
    }
  }

  return { handleStorylineClick, handleCreateStoryline };
}
