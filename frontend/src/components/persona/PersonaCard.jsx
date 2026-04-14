import { useState, useEffect } from 'react';
import { getPersona } from '../../api/personas';

/**
 * PersonaCard — 在角色列表页顶部展示玩家人设简介（只读卡片）
 */
export default function PersonaCard({ worldId }) {
  const [persona, setPersona] = useState(null);

  useEffect(() => {
    if (!worldId) return;
    getPersona(worldId).then(setPersona).catch(() => {});
  }, [worldId]);

  if (!persona || (!persona.name && !persona.system_prompt)) return null;

  return (
    <div className="mb-6 bg-[var(--code-bg)] border border-[var(--border)] rounded-xl px-5 py-4">
      <p className="text-xs font-semibold text-[var(--text)] uppercase tracking-wide opacity-50 mb-2">玩家</p>
      <div className="flex flex-col gap-1">
        {persona.name && (
          <p className="text-sm font-medium text-[var(--text-h)]">{persona.name}</p>
        )}
        {persona.system_prompt && (
          <p className="text-xs text-[var(--text)] line-clamp-2">{persona.system_prompt}</p>
        )}
      </div>
    </div>
  );
}
