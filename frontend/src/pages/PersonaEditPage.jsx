import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { getPersona, updatePersona, uploadPersonaAvatar } from '../api/personas';
import { getPersonaStateValues, updatePersonaStateValue } from '../api/persona-state-values';
import { downloadPersonaCard } from '../api/import-export';
import { getAvatarColor, getAvatarUrl } from '../utils/avatar';
import MarkdownEditor from '../components/ui/MarkdownEditor';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import StateValueField from '../components/state/StateValueField';
import EditPageShell from '../components/ui/EditPageShell';
import FormGroup from '../components/ui/FormGroup';
import AvatarUpload from '../components/ui/AvatarUpload';

export default function PersonaEditPage() {
  const { worldId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isOverlay = !!location.state?.backgroundLocation;
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

  return (
    <EditPageShell loading={loading} isOverlay={isOverlay} onClose={() => navigate(-1)} title="玩家人设">
      <div className="we-edit-form-stack">
        <AvatarUpload
          name={name}
          avatarUrl={avatarUrl}
          avatarColor={avatarColor}
          avatarUploading={avatarUploading}
          fileInputRef={fileInputRef}
          onAvatarClick={() => fileInputRef.current?.click()}
          onFileChange={handleFileChange}
        />

        <FormGroup label="玩家名">
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="你在这个世界里的名字" />
        </FormGroup>

        <FormGroup label="人设">
          <MarkdownEditor value={systemPrompt} onChange={setSystemPrompt} placeholder="你的身份、背景等" minHeight={120} />
        </FormGroup>

        {stateFields.length > 0 && (
          <div>
            <div className="we-edit-state-sep" />
            <FormGroup label="玩家状态">
              <div className="we-state-value-list" style={{ marginTop: 8 }}>
                {stateFields.map(f => (
                  <div key={f.field_key} style={{ marginBottom: 12 }}>
                    <p className="we-state-value-label" style={{ marginBottom: 4 }}>{f.label}</p>
                    <StateValueField field={f} onSave={handleStateValueSave} />
                  </div>
                ))}
              </div>
            </FormGroup>
          </div>
        )}

        <div className="we-edit-save-row">
          <Button variant="ghost" size="sm" onClick={handleExport}>导出为角色卡</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </Button>
        </div>
      </div>
    </EditPageShell>
  );
}
