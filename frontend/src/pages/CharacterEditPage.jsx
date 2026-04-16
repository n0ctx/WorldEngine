import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getCharacter, updateCharacter, uploadAvatar } from '../api/characters';
import { getAvatarColor, getAvatarUrl } from '../utils/avatar';
import EntryList from '../components/prompt/EntryList';
import { downloadCharacterCard } from '../api/importExport';
import { getCharacterStateValues, updateCharacterStateValue } from '../api/characterStateValues';
import MarkdownEditor from '../components/ui/MarkdownEditor';
import Select from '../components/ui/Select';

function StateValueField({ field, onSave }) {
  const parseValue = (vj) => {
    try { return vj != null ? JSON.parse(vj) : null; }
    catch { return vj ?? null; }
  };
  const [local, setLocal] = useState(() => parseValue(field.value_json));

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

export default function CharacterEditPage() {
  const { characterId } = useParams();
  const navigate = useNavigate();

  const [character, setCharacter] = useState(null);
  const [loading, setLoading] = useState(true);

  // 表单字段
  const [name, setName] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [postPrompt, setPostPrompt] = useState('');
  const [firstMessage, setFirstMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [exporting, setExporting] = useState(false);

  // 状态字段值
  const [stateFields, setStateFields] = useState([]);

  // 头像
  const [avatarPath, setAvatarPath] = useState(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    Promise.all([
      getCharacter(characterId),
      getCharacterStateValues(characterId),
    ]).then(([c, fields]) => {
      setCharacter(c);
      setName(c.name);
      setSystemPrompt(c.system_prompt ?? '');
      setPostPrompt(c.post_prompt ?? '');
      setFirstMessage(c.first_message ?? '');
      setAvatarPath(c.avatar_path);
      setStateFields(fields);
      setLoading(false);
    });
  }, [characterId]);

  async function handleStateValueSave(fieldKey, valueJson) {
    try {
      await updateCharacterStateValue(characterId, fieldKey, valueJson);
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
      const result = await uploadAvatar(characterId, file);
      setAvatarPath(result.avatar_path);
    } catch (err) {
      alert(`头像上传失败：${err.message}`);
    } finally {
      setAvatarUploading(false);
      // 清空 input，允许再次选择同一文件
      e.target.value = '';
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const safeName = (name || character.name || 'character').replace(/[^\w\u4e00-\u9fa5]/g, '_');
      await downloadCharacterCard(characterId, `${safeName}.wechar.json`);
    } catch (err) {
      alert(`导出失败：${err.message}`);
    } finally {
      setExporting(false);
    }
  }

  async function handleSave() {
    if (!name.trim()) {
      setSaveError('名称为必填项');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      await updateCharacter(characterId, {
        name: name.trim(),
        system_prompt: systemPrompt,
        post_prompt: postPrompt,
        first_message: firstMessage,
      });
      navigate(-1);
    } catch (e) {
      setSaveError(e.message);
    } finally {
      setSaving(false);
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
  const avatarColor = getAvatarColor(character.id);
  const avatarInitial = (name || '?')[0].toUpperCase();

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
              disabled={exporting}
              className="px-3 py-1.5 text-sm border border-border rounded-lg text-text-secondary hover:text-text hover:border-accent/40 transition-colors disabled:opacity-50"
            >
              {exporting ? '导出中…' : '导出角色卡'}
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
          <h1 className="text-2xl font-serif font-semibold text-text tracking-tight mb-8">编辑角色</h1>

          {/* 头像区域 */}
          <div className="flex flex-col items-center mb-8">
            <div
              className="relative cursor-pointer group"
              onClick={handleAvatarClick}
            >
              {/* 头像 */}
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

              {/* loading 覆盖层 */}
              {avatarUploading && (
                <div className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center">
                  <span className="text-white text-xs">上传中…</span>
                </div>
              )}

              {/* hover 遮罩 */}
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
              <label className="block text-sm text-text-secondary mb-1.5">名称 <span className="text-red-400">*</span></label>
              <input
                className="w-full px-3 py-2.5 bg-ivory border border-border rounded-lg text-text text-sm focus:outline-none focus:border-accent"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="角色的名字"
              />
            </div>

            <div>
              <label className="block text-sm text-text-secondary mb-1.5">System Prompt</label>
              <MarkdownEditor
                value={systemPrompt}
                onChange={setSystemPrompt}
                placeholder="角色的性格、背景、说话风格……"
                minHeight={144}
              />
            </div>

            <div>
              <label className="block text-sm text-text-secondary mb-1.5">
                后置提示词
                <span className="text-text-secondary opacity-40 ml-1.5 text-xs">插入在用户消息之后，作为 user 角色发送</span>
              </label>
              <MarkdownEditor
                value={postPrompt}
                onChange={setPostPrompt}
                placeholder="每次对话附加的角色级指令，例如特定的回复格式……"
                minHeight={72}
              />
            </div>

            <div>
              <label className="block text-sm text-text-secondary mb-1.5">开场白</label>
              <MarkdownEditor
                value={firstMessage}
                onChange={setFirstMessage}
                placeholder="角色在对话开始时主动说的第一句话，留空则由用户先开口"
                minHeight={96}
              />
            </div>

            {saveError && <p className="text-sm text-red-400">{saveError}</p>}
          </div>

          {/* Prompt 条目 */}
          <div className="mt-10 border-t border-border pt-8">
            <EntryList type="character" scopeId={characterId} />
          </div>

          {/* 当前状态字段值 */}
          {stateFields.length > 0 && (
            <div className="mt-6 border-t border-border pt-8">
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
  );
}
