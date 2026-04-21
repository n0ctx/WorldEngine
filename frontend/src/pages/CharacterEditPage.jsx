import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { getCharacter, updateCharacter, uploadAvatar } from '../api/characters';
import { getAvatarColor, getAvatarUrl } from '../utils/avatar';
import EntryList from '../components/prompt/EntryList';
import { downloadCharacterCard, importCharacter, readJsonFile } from '../api/import-export';
import { getCharacterStateValues, updateCharacterStateValue } from '../api/character-state-values';
import MarkdownEditor from '../components/ui/MarkdownEditor';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import SectionTabs from '../components/book/SectionTabs';
import SealStampAnimation from '../components/book/SealStampAnimation';
import StateValueField from '../components/state/StateValueField';

function AvatarUpload({ name, avatarUrl, avatarColor, avatarUploading, onAvatarClick, fileInputRef, onFileChange }) {
  const initial = (name || '?')[0].toUpperCase();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '24px' }}>
      <div
        style={{ position: 'relative', cursor: 'pointer' }}
        className="group"
        onClick={onAvatarClick}
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={name}
            style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: '50%',
              background: avatarColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--we-font-display)',
              fontSize: '28px',
              fontWeight: 300,
              color: '#fff',
            }}
          >
            {initial}
          </div>
        )}
        {avatarUploading && (
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ color: '#fff', fontSize: 12 }}>上传中…</span>
          </div>
        )}
        {!avatarUploading && (
          <div className="group-hover:opacity-100" style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            background: 'rgba(0,0,0,0)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.15s',
          }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.35)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,0,0,0)'}
          >
            <span style={{ color: '#fff', fontSize: 12, opacity: 0, transition: 'opacity 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.opacity = '1'}
              onMouseLeave={e => e.currentTarget.style.opacity = '0'}
            >
              更换头像
            </span>
          </div>
        )}
      </div>
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
      <p style={{ fontFamily: 'var(--we-font-serif)', fontSize: 12, color: 'var(--we-ink-faded)', marginTop: 8, opacity: 0.7 }}>
        点击头像上传图片
      </p>
    </div>
  );
}

export default function CharacterEditPage() {
  const { characterId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isOverlay = !!location.state?.backgroundLocation;
  const fileInputRef = useRef(null);
  const charImportRef = useRef(null);

  const [character, setCharacter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [sealKey, setSealKey] = useState(0);
  const [importing, setImporting] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);

  const [name, setName] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [postPrompt, setPostPrompt] = useState('');
  const [firstMessage, setFirstMessage] = useState('');
  const [avatarPath, setAvatarPath] = useState(null);
  const [stateFields, setStateFields] = useState([]);
  const [reloadKey, setReloadKey] = useState(0);

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
  }, [characterId, reloadKey]);

  useEffect(() => {
    const h = () => setReloadKey((k) => k + 1);
    window.addEventListener('we:character-updated', h);
    return () => window.removeEventListener('we:character-updated', h);
  }, []);

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
      window.dispatchEvent(new Event('we:character-updated'));
    } catch (err) {
      alert(`头像上传失败：${err.message}`);
    } finally {
      setAvatarUploading(false);
      e.target.value = '';
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const safeName = (name || character?.name || 'character').replace(/[^\w\u4e00-\u9fa5]/g, '_');
      await downloadCharacterCard(characterId, `${safeName}.wechar.json`);
      setSealKey(k => k + 1);
    } catch (err) {
      alert(`导出失败：${err.message}`);
    } finally {
      setExporting(false);
    }
  }

  async function handleImportCharFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const data = await readJsonFile(file);
      await importCharacter(character?.world_id, data);
      navigate(-1);
    } catch (err) {
      alert(`导入失败：${err.message}`);
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  }

  async function handleSave() {
    if (!name.trim()) { setSaveError('名称为必填项'); return; }
    setSaving(true);
    setSaveError('');
    try {
      await updateCharacter(characterId, {
        name: name.trim(),
        system_prompt: systemPrompt,
        post_prompt: postPrompt,
        first_message: firstMessage,
      });
      window.dispatchEvent(new Event('we:character-updated'));
      navigate(-1);
    } catch (e) {
      setSaveError(e.message);
    } finally {
      setSaving(false);
    }
  }

  function handleClose() {
    navigate(-1);
  }

  if (loading) {
    return (
      isOverlay ? (
        <div className="we-settings-overlay" onClick={handleClose}>
          <div className="we-edit-panel we-edit-panel-overlay" onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p className="we-edit-empty-text">加载中…</p>
          </div>
        </div>
      ) : (
        <div className="we-edit-canvas" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p className="we-edit-empty-text">加载中…</p>
        </div>
      )
    );
  }

  const avatarUrl = getAvatarUrl(avatarPath);
  const avatarColor = getAvatarColor(character.id);

  const sections = [
    {
      key: 'basic',
      label: '角色设定',
      content: (
        <div className="we-edit-form-stack">
          <AvatarUpload
            name={name}
            avatarUrl={avatarUrl}
            avatarColor={avatarColor}
            avatarUploading={avatarUploading}
            onAvatarClick={handleAvatarClick}
            fileInputRef={fileInputRef}
            onFileChange={handleFileChange}
          />
          <div className="we-edit-form-group">
            <label className="we-edit-label">
              名称 <span style={{ color: 'var(--we-vermilion)' }}>*</span>
            </label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="角色的名字" />
          </div>
          <div className="we-edit-form-group">
            <label className="we-edit-label">System Prompt</label>
            <MarkdownEditor value={systemPrompt} onChange={setSystemPrompt} placeholder="角色的性格、背景、说话风格……" minHeight={144} />
          </div>
          <div className="we-edit-form-group">
            <label className="we-edit-label">
              后置提示词
              <span className="we-edit-label-hint">插入在用户消息之后，作为 user 角色发送</span>
            </label>
            <MarkdownEditor value={postPrompt} onChange={setPostPrompt} placeholder="每次对话附加的角色级指令，例如特定的回复格式……" minHeight={72} />
          </div>
          <div className="we-edit-form-group">
            <label className="we-edit-label">开场白</label>
            <MarkdownEditor value={firstMessage} onChange={setFirstMessage} placeholder="角色在对话开始时主动说的第一句话，留空则由用户先开口" minHeight={96} />
          </div>
          {saveError && <p className="we-edit-error">{saveError}</p>}
          <div className="we-edit-save-row">
            <Button variant="primary" onClick={handleSave} disabled={saving}>
              {saving ? '保存中…' : '保存'}
            </Button>
          </div>
        </div>
      ),
    },
    {
      key: 'state_init',
      label: '状态初始值',
      content: stateFields.length === 0 ? (
        <p className="we-edit-empty-text">暂无状态字段（可在世界编辑页添加角色状态模板）</p>
      ) : (
        <div className="we-state-value-list">
          {stateFields.map(f => (
            <div key={f.field_key} className="we-state-value-row">
              <div>
                <p className="we-state-value-label">{f.label}</p>
                <p className="we-state-value-key">{f.field_key}</p>
              </div>
              <StateValueField field={f} onSave={handleStateValueSave} />
            </div>
          ))}
        </div>
      ),
    },
    {
      key: 'prompt_entries',
      label: 'Prompt 条目',
      content: <EntryList type="character" scopeId={characterId} />,
    },
    {
      key: 'export',
      label: '导入导出',
      content: (
        <div>
          <div className="we-edit-form-group">
            <h3 className="we-edit-subsection-title">导出角色卡</h3>
            <p className="we-edit-hint">将此角色导出为 .wechar.json 文件，包含所有配置和状态字段定义。</p>
            <div style={{ marginTop: '12px' }}>
              <Button variant="secondary" onClick={handleExport} disabled={exporting}>
                {exporting ? '导出中…' : '导出 .wechar.json'}
              </Button>
            </div>
          </div>
          <div className="we-edit-state-sep" />
          <div className="we-edit-form-group">
            <h3 className="we-edit-subsection-title">导入角色卡</h3>
            <p className="we-edit-hint">导入 .wechar.json 将在当前世界创建一个新角色（不覆盖当前角色）。</p>
            <div style={{ marginTop: '12px' }}>
              <Button variant="secondary" onClick={() => charImportRef.current?.click()} disabled={importing}>
                {importing ? '导入中…' : '导入角色卡…'}
              </Button>
              <input
                ref={charImportRef}
                type="file"
                accept=".json,.wechar.json"
                className="hidden"
                onChange={handleImportCharFile}
              />
            </div>
          </div>
        </div>
      ),
    },
  ];

  const content = (
    <div
      className={`we-edit-panel${isOverlay ? ' we-edit-panel-overlay' : ''}`}
      onClick={isOverlay ? (e) => e.stopPropagation() : undefined}
    >
        <div className="we-edit-header">
          <button className="we-edit-back" onClick={handleClose}>← 返回</button>
          <h1 className="we-edit-title">编辑角色 · {name}</h1>
        </div>
        <SectionTabs sections={sections} defaultKey="basic" />
      </div>
  );

  return (
    <>
      {isOverlay ? (
        <div className="we-settings-overlay" onClick={handleClose}>
          {content}
        </div>
      ) : (
        <div className="we-edit-canvas">
          {content}
        </div>
      )}
      <SealStampAnimation trigger={sealKey} text="成" />
    </>
  );
}
