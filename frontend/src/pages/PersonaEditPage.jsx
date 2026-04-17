import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getPersona, updatePersona, uploadPersonaAvatar } from '../api/personas';
import { getPersonaStateValues, updatePersonaStateValue } from '../api/personaStateValues';
import { downloadPersonaCard } from '../api/importExport';
import { getAvatarColor, getAvatarUrl } from '../utils/avatar';
import MarkdownEditor from '../components/ui/MarkdownEditor';
import Select from '../components/ui/Select';

function StateValueField({ field, onSave }) {
  const parseValue = (vj) => {
    try { return vj != null ? JSON.parse(vj) : null; }
    catch { return vj ?? null; }
  };
  const [local, setLocal] = useState(() => parseValue(field.default_value_json));

  function saveValue(val) {
    onSave(field.field_key, JSON.stringify(val));
  }

  const inputClass = 'w-full px-3 py-2 bg-ivory border border-border rounded-lg text-text text-sm focus:outline-none focus:border-accent';

  if (field.type === 'boolean') {
    return (
      <input
        type="checkbox"
        checked={!!local}
        onChange={(e) => { setLocal(e.target.checked); saveValue(e.target.checked); }}
        className="accent-accent w-4 h-4"
      />
    );
  }
  if (field.type === 'number') {
    return (
      <input
        type="number"
        value={local ?? ''}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => saveValue(local === '' || local == null ? null : Number(local))}
        className={inputClass}
      />
    );
  }
  if (field.type === 'enum') {
    const options = (() => { try { return JSON.parse(field.enum_options || '[]'); } catch { return []; } })();
    return (
      <Select
        value={local ?? ''}
        onChange={(v) => { setLocal(v); saveValue(v); }}
        options={[{ value: '', label: '—' }, ...options.map((o) => ({ value: o, label: o }))]}
      />
    );
  }
  if (field.type === 'list') {
    const displayValue = Array.isArray(local) ? local.join(', ') : (local ?? '');
    return (
      <input
        type="text"
        value={displayValue}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          const arr = String(local).split(',').map((s) => s.trim()).filter(Boolean);
          saveValue(arr);
        }}
        placeholder="逗号分隔多个条目"
        className={inputClass}
      />
    );
  }
  // text (default)
  return (
    <input
      type="text"
      value={local ?? ''}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => saveValue(String(local ?? ''))}
      className={inputClass}
    />
  );
}

export default function PersonaEditPage() {
  const { worldId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const [personaId, setPersonaId] = useState(null);
  const [name, setName] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [avatarPath, setAvatarPath] = useState(null);
  const [stateFields, setStateFields] = useState([]);

  const fileInputRef = useRef(null);

  useEffect(() => {
    Promise.all([
      getPersona(worldId),
      getPersonaStateValues(worldId),
    ]).then(([p, fields]) => {
      setPersonaId(p.id);
      setName(p.name ?? '');
      setSystemPrompt(p.system_prompt ?? '');
      setAvatarPath(p.avatar_path ?? null);
      setStateFields(fields);
      setLoading(false);
    });
  }, [worldId]);

  async function handleStateValueSave(fieldKey, valueJson) {
    try {
      await updatePersonaStateValue(worldId, fieldKey, valueJson);
    } catch (err) {
      console.error('状态值保存失败', err);
    }
  }

  async function handleAvatarClick() {
    fileInputRef.current?.click();
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    try {
      const result = await uploadPersonaAvatar(worldId, file);
      setAvatarPath(result.avatar_path);
    } catch (err) {
      alert(`头像上传失败：${err.message}`);
    } finally {
      setAvatarUploading(false);
      e.target.value = '';
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await updatePersona(worldId, { name, system_prompt: systemPrompt });
      navigate(-1);
    } catch (err) {
      alert(`保存失败：${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleExport() {
    try {
      await downloadPersonaCard(worldId, `${name || '玩家'}.wechar.json`);
    } catch (err) {
      alert(`导出失败：${err.message}`);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-text-secondary">
        加载中…
      </div>
    );
  }

  const avatarUrl = getAvatarUrl(avatarPath);
  const avatarColor = getAvatarColor(personaId || worldId);
  const avatarInitial = (name || '玩')[0].toUpperCase();

  return (
    <div className="min-h-screen bg-canvas">
      {/* 固定顶栏 */}
      <div className="sticky top-0 z-40 bg-canvas border-b border-border px-4">
        <div className="max-w-[56rem] mx-auto flex items-center justify-between py-2.5">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text transition-colors"
          >
            ← 返回
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/settings')}
              className="text-sm text-text-secondary hover:text-text transition-colors opacity-60 hover:opacity-100"
            >
              设置
            </button>
            <span className="border-l border-border h-4" />
            <button
              onClick={handleExport}
              className="px-3 py-1.5 text-sm border border-border rounded-lg text-text-secondary hover:text-text hover:border-accent/40 transition-colors"
            >
              导出为角色卡
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-1.5 bg-accent text-white text-sm rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      </div>

      {/* 内容区 */}
      <div className="px-4 pt-8 pb-10">
        <div className="max-w-[56rem] mx-auto">
          <h1 className="text-2xl font-serif font-semibold text-text tracking-tight mb-8">编辑玩家</h1>

          {/* 头像区域 */}
          <div className="flex flex-col items-center mb-8">
            <div
              className="relative cursor-pointer group"
              onClick={handleAvatarClick}
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={name}
                  className="w-24 h-24 rounded-full object-cover"
                />
              ) : (
                <div
                  className="w-24 h-24 rounded-full flex items-center justify-center text-3xl font-semibold text-white"
                  style={{ backgroundColor: avatarColor }}
                >
                  {avatarInitial}
                </div>
              )}

              {avatarUploading && (
                <div className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center">
                  <span className="text-white text-xs">上传中…</span>
                </div>
              )}

              {!avatarUploading && (
                <div className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                  <span className="text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity">更换头像</span>
                </div>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
            <p className="text-xs text-text-secondary mt-2 opacity-60">点击头像上传图片</p>
          </div>

          {/* 表单 */}
          <div className="flex flex-col gap-5">
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">名字</label>
              <input
                className="w-full px-3 py-2.5 bg-ivory border border-border rounded-lg text-text text-sm focus:outline-none focus:border-accent"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="你在这个世界里的名字"
              />
            </div>

            <div>
              <label className="block text-sm text-text-secondary mb-1.5">人设</label>
              <MarkdownEditor
                value={systemPrompt}
                onChange={setSystemPrompt}
                placeholder="你的身份、背景等"
                minHeight={144}
              />
            </div>

            {stateFields.length > 0 && (
              <div className="border-t border-border pt-5">
                <h3 className="text-sm font-semibold text-text-secondary mb-4">当前状态字段值</h3>
                <div className="flex flex-col gap-4">
                  {stateFields.map((field) => (
                    <div key={field.field_key}>
                      <label className="block text-sm text-text-secondary mb-1.5">{field.label}</label>
                      <StateValueField field={field} onSave={handleStateValueSave} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
