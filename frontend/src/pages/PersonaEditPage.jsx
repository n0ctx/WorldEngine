import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getPersona, updatePersona, uploadPersonaAvatar } from '../api/personas';
import { getPersonaStateValues, updatePersonaStateValue } from '../api/persona-state-values';
import { downloadPersonaCard } from '../api/import-export';
import { getAvatarColor, getAvatarUrl } from '../utils/avatar';
import MarkdownEditor from '../components/ui/MarkdownEditor';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import StateValueField from '../components/state/StateValueField';

export default function PersonaEditPage() {
  const { worldId } = useParams();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const [personaId, setPersonaId] = useState(null);
  const [name, setName] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [avatarPath, setAvatarPath] = useState(null);
  const [stateFields, setStateFields] = useState([]);

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
  }, [worldId, reloadKey]);

  useEffect(() => {
    const h = () => setReloadKey((k) => k + 1);
    window.addEventListener('we:persona-updated', h);
    return () => window.removeEventListener('we:persona-updated', h);
  }, []);

  async function handleStateValueSave(fieldKey, valueJson) {
    try {
      await updatePersonaStateValue(worldId, fieldKey, valueJson);
    } catch (err) {
      console.error('状态值保存失败', err);
    }
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    try {
      const result = await uploadPersonaAvatar(worldId, file);
      setAvatarPath(result.avatar_path);
      window.dispatchEvent(new Event('we:persona-updated'));
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
      window.dispatchEvent(new Event('we:persona-updated'));
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

  const avatarUrl = getAvatarUrl(avatarPath);
  const avatarColor = getAvatarColor(personaId || worldId);
  const avatarInitial = (name || '玩')[0].toUpperCase();

  if (loading) {
    return (
      <div className="we-edit-canvas" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p className="we-edit-empty-text">加载中…</p>
      </div>
    );
  }

  return (
    <div className="we-edit-canvas">
      <div className="we-edit-panel">
        <div className="we-edit-header">
          <button className="we-edit-back" onClick={() => navigate(-1)}>← 返回</button>
          <h1 className="we-edit-title">玩家人设</h1>
        </div>

        <div className="we-edit-form-stack">
          {/* 头像 */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '24px' }}>
            <div
              style={{ position: 'relative', cursor: 'pointer' }}
              onClick={() => fileInputRef.current?.click()}
              onMouseEnter={e => {
                const mask = e.currentTarget.querySelector('.avatar-mask');
                if (mask) { mask.style.background = 'rgba(0,0,0,0.35)'; mask.querySelector('span').style.opacity = '1'; }
              }}
              onMouseLeave={e => {
                const mask = e.currentTarget.querySelector('.avatar-mask');
                if (mask) { mask.style.background = 'rgba(0,0,0,0)'; mask.querySelector('span').style.opacity = '0'; }
              }}
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt={name} style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', display: 'block' }} />
              ) : (
                <div style={{
                  width: 80, height: 80, borderRadius: '50%',
                  background: avatarColor,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--we-font-display)', fontSize: 28, fontWeight: 300, color: '#fff',
                }}>
                  {avatarInitial}
                </div>
              )}
              {avatarUploading && (
                <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ color: '#fff', fontSize: 11 }}>上传中…</span>
                </div>
              )}
              <div className="avatar-mask" style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(0,0,0,0)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' }}>
                <span style={{ color: '#fff', fontSize: 11, opacity: 0, transition: 'opacity 0.15s' }}>更换头像</span>
              </div>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            <p style={{ fontFamily: 'var(--we-font-serif)', fontSize: 11, color: 'var(--we-ink-faded)', marginTop: 6, opacity: 0.7 }}>
              点击头像上传图片
            </p>
          </div>

          {/* 表单 */}
          <div className="we-edit-form-group">
            <label className="we-edit-label">玩家名</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="你在这个世界里的名字" />
          </div>

          <div className="we-edit-form-group">
            <label className="we-edit-label">人设</label>
            <MarkdownEditor value={systemPrompt} onChange={setSystemPrompt} placeholder="你的身份、背景等" minHeight={120} />
          </div>

          {stateFields.length > 0 && (
            <div>
              <div className="we-edit-state-sep" />
              <div className="we-edit-form-group">
                <label className="we-edit-label">玩家状态</label>
                <div className="we-state-value-list" style={{ marginTop: 8 }}>
                  {stateFields.map(f => (
                    <div key={f.field_key} style={{ marginBottom: 12 }}>
                      <p className="we-state-value-label" style={{ marginBottom: 4 }}>{f.label}</p>
                      <StateValueField field={f} onSave={handleStateValueSave} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="we-edit-state-sep" />

          <div className="we-edit-save-row">
            <Button variant="ghost" size="sm" onClick={handleExport}>导出为角色卡</Button>
            <Button variant="primary" onClick={handleSave} disabled={saving}>
              {saving ? '保存中…' : '保存'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
