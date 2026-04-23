import { useState, useEffect } from 'react';
import { getPersona } from '../../api/personas';
import AvatarCircle from '../ui/AvatarCircle';

/**
 * PersonaCard — 角色列表页顶部的玩家人设预览卡片
 * Props:
 *   worldId    — 当前世界 ID
 *   refreshKey — 外部触发刷新的 key
 *   onEdit     — 点击编辑按钮回调
 */
export default function PersonaCard({ worldId, refreshKey, onEdit }) {
  const [persona, setPersona] = useState(null);

  useEffect(() => {
    if (!worldId) return;
    getPersona(worldId).then(setPersona).catch(() => {});
  }, [worldId, refreshKey]);

  if (!persona || (!persona.name && !persona.system_prompt && !persona.avatar_path)) {
    return (
      <div className="we-persona-card-wrap">
        <p className="we-persona-section-label">玩家</p>
        <p className="we-persona-empty-hint">尚未设置人设</p>
        <button
          onClick={onEdit}
          className="we-character-card-action-btn we-persona-card-edit-btn"
          title="编辑玩家"
        >
          ✎
        </button>
      </div>
    );
  }

  return (
    <div className="we-persona-card-wrap">
      <p className="we-persona-section-label">玩家</p>
      <div className="we-persona-card-body">
        <AvatarCircle
          id={persona.id}
          name={persona.name}
          avatarPath={persona.avatar_path}
          size="sm"
        />
        <div className="we-persona-card-info">
          {persona.name && (
            <p className="we-persona-card-name">{persona.name}</p>
          )}
          {persona.system_prompt && (
            <p className="we-persona-card-desc">{persona.system_prompt}</p>
          )}
        </div>
      </div>
      <button
        onClick={onEdit}
        className="we-character-card-action-btn we-persona-card-edit-btn"
        title="编辑玩家"
      >
        ✎
      </button>
    </div>
  );
}
