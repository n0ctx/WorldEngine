import { useNavigate } from 'react-router-dom';
import useStore from '../state/index.js';
import { formatDateLiterary } from '../utils/date-format.js';

/** 世界时间线条目的显示标题：无标题时按对话角色或写作创建日期生成 */
export function storylineTitle(item, charactersById) {
  if (item.title) return item.title;
  if (item.mode === 'chat') {
    const c = charactersById[item.character_id];
    return c ? `与 ${c.name} 的对话` : '对话';
  }
  return `${formatDateLiterary(item.created_at)}的写作`;
}

/** 返回打开时间线条目的函数：写作进入世界写作页，对话切到对应角色会话 */
export function useOpenStoryline(worldId) {
  const navigate = useNavigate();
  const setCurrentCharacterId = useStore((s) => s.setCurrentCharacterId);
  const setCurrentSessionId = useStore((s) => s.setCurrentSessionId);
  const setCurrentWritingSessionId = useStore((s) => s.setCurrentWritingSessionId);

  return function openStoryline(item) {
    if (item.mode === 'writing') {
      setCurrentWritingSessionId(item.id);
      navigate(`/worlds/${worldId}/writing`);
    } else {
      setCurrentCharacterId(item.character_id);
      setCurrentSessionId(item.id);
      navigate(`/characters/${item.character_id}/chat`);
    }
  };
}
