import { useState, useEffect } from 'react';
import { getPersona, updatePersona } from '../../api/personas';

/**
 * PersonaEditor — 用于在 WorldFormModal 内嵌显示和编辑玩家 Persona 信息
 * （名字 + System Prompt，内联编辑，自动保存）
 */
export default function PersonaEditor({ worldId }) {
  const [name, setName] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!worldId) return;
    getPersona(worldId).then((p) => {
      setName(p.name ?? '');
      setSystemPrompt(p.system_prompt ?? '');
      setLoaded(true);
    }).catch(() => {});
  }, [worldId]);

  async function save(patch) {
    setSaving(true);
    try {
      await updatePersona(worldId, patch);
    } catch {
      // 静默失败，非关键操作
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return <p className="text-xs opacity-30 py-2">加载中…</p>;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-[var(--text)] opacity-60 -mt-1">
        {saving ? '保存中…' : ''}
      </p>
      <div>
        <label className="block text-sm text-[var(--text)] mb-1">你的名字</label>
        <input
          className="w-full px-3 py-2 bg-[var(--code-bg)] border border-[var(--border)] rounded-lg text-[var(--text-h)] text-sm focus:outline-none focus:border-[var(--accent)]"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => save({ name })}
          placeholder="你在这个世界里的名字"
        />
      </div>
      <div>
        <label className="block text-sm text-[var(--text)] mb-1">你的人设</label>
        <textarea
          className="w-full px-3 py-2 bg-[var(--code-bg)] border border-[var(--border)] rounded-lg text-[var(--text-h)] text-sm focus:outline-none focus:border-[var(--accent)] resize-none"
          rows={3}
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          onBlur={() => save({ system_prompt: systemPrompt })}
          placeholder="你的身份、背景等"
        />
      </div>
    </div>
  );
}
