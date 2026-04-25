import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  getPersona,
  updatePersona,
  uploadPersonaAvatar,
  getPersonaById,
  updatePersonaById,
  createPersona,
} from '../api/personas';
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
  const { worldId, personaId: personaIdParam } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isOverlay = !!location.state?.backgroundLocation;
  const fileInputRef = useRef(null);
  // 路由 /personas/new 中 'new' 是字面路径段而非参数，personaIdParam 为 undefined
  const isNew = location.pathname.endsWith('/personas/new');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);

  // resolvedPersonaId: 加载完成后的实际 persona id（new 模式下为 null 直到创建成功）
  const [resolvedPersonaId, setResolvedPersonaId] = useState(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [avatarPath, setAvatarPath] = useState(null);
  const [stateFields, setStateFields] = useState([]);

  useEffect(() => {
    if (isNew) {
      // 新建模式：不预加载数据，直接显示空表单
      getPersonaStateValues(worldId).then(setStateFields).catch(() => {});
      setLoading(false);
      return;
    }

    if (personaIdParam) {
      // 按 id 加载
      Promise.all([
        getPersonaById(personaIdParam),
        getPersonaStateValues(worldId),
      ]).then(([p, fields]) => {
        if (p) {
          setResolvedPersonaId(p.id);
          setName(p.name ?? '');
          setDescription(p.description ?? '');
          setSystemPrompt(p.system_prompt ?? '');
          setAvatarPath(p.avatar_path ?? null);
        }
        setStateFields(fields);
        setLoading(false);
      }).catch(() => setLoading(false));
    } else {
      // 兼容旧路由 /worlds/:worldId/persona（加载 active persona）
      Promise.all([
        getPersona(worldId),
        getPersonaStateValues(worldId),
      ]).then(([p, fields]) => {
        setResolvedPersonaId(p.id);
        setName(p.name ?? '');
        setDescription(p.description ?? '');
        setSystemPrompt(p.system_prompt ?? '');
        setAvatarPath(p.avatar_path ?? null);
        setStateFields(fields);
        setLoading(false);
      }).catch(() => setLoading(false));
    }
  }, [worldId, personaIdParam, isNew, reloadKey]);

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
      let result;
      if (resolvedPersonaId) {
        // 有 id：用新接口按 id 上传
        const formData = new FormData();
        formData.append('avatar', file);
        const res = await fetch(`/api/personas/${resolvedPersonaId}/avatar`, { method: 'POST', body: formData });
        if (!res.ok) throw new Error(await res.text());
        result = await res.json();
      } else {
        // 旧路由兼容
        result = await uploadPersonaAvatar(worldId, file);
      }
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
      if (isNew) {
        // 新建：创建 persona 后跳转到编辑页
        const persona = await createPersona(worldId, { name, description, system_prompt: systemPrompt });
        window.dispatchEvent(new Event('we:persona-updated'));
        // 替换路由为编辑页（不在历史里留下 /new）
        navigate(`/worlds/${worldId}/personas/${persona.id}/edit`, {
          replace: true,
          state: location.state,
        });
      } else if (resolvedPersonaId) {
        await updatePersonaById(resolvedPersonaId, { name, description, system_prompt: systemPrompt });
        window.dispatchEvent(new Event('we:persona-updated'));
        navigate(-1);
      } else {
        // 旧路由兼容
        await updatePersona(worldId, { name, description, system_prompt: systemPrompt });
        window.dispatchEvent(new Event('we:persona-updated'));
        navigate(-1);
      }
    } catch (err) {
      alert(`保存失败：${err.message}`);
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
  const avatarColor = getAvatarColor(resolvedPersonaId || personaIdParam || worldId);
  const pageTitle = isNew ? '创建玩家' : '编辑玩家卡';

  const exportAction = !isNew ? (
    <Button variant="ghost" size="sm" onClick={handleExport}>导出玩家卡</Button>
  ) : null;

  return (
    <EditPageShell loading={loading} isOverlay={isOverlay} onClose={() => navigate(-1)} title={pageTitle} headerActions={exportAction}>
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

        <FormGroup label="简介" hint="纯展示用途，不注入提示词">
          <textarea
            className="we-textarea"
            rows={3}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="一句话介绍这个玩家…"
          />
        </FormGroup>

        <FormGroup label="人设">
          <MarkdownEditor value={systemPrompt} onChange={setSystemPrompt} placeholder="你的身份、背景等" minHeight={120} />
        </FormGroup>

        {stateFields.length > 0 && (
          <div>
            <div className="we-edit-state-sep" />
            <FormGroup label="玩家状态">
              <div className="we-state-value-list we-persona-state-list">
                {stateFields.map(f => (
                  <div key={f.field_key} className="we-persona-state-item">
                    <p className="we-state-value-label we-persona-state-label">{f.label}</p>
                    <StateValueField field={f} onSave={handleStateValueSave} />
                  </div>
                ))}
              </div>
            </FormGroup>
          </div>
        )}

        <div className="we-edit-save-row">
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? '保存中…' : isNew ? '创建' : '保存'}
          </Button>
        </div>
      </div>
    </EditPageShell>
  );
}
