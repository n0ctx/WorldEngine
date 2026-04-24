import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { getCharacter, updateCharacter, uploadAvatar, createCharacter } from '../api/characters';
import { getAvatarColor, getAvatarUrl } from '../utils/avatar';
import { downloadCharacterCard, importCharacter, readJsonFile } from '../api/import-export';
import { getCharacterStateValues, updateCharacterStateValue } from '../api/character-state-values';
import MarkdownEditor from '../components/ui/MarkdownEditor';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import SectionTabs from '../components/book/SectionTabs';
import SealStampAnimation from '../components/book/SealStampAnimation';
import StateValueField from '../components/state/StateValueField';
import EditPageShell from '../components/ui/EditPageShell';
import FormGroup from '../components/ui/FormGroup';
import AvatarUpload from '../components/ui/AvatarUpload';

export default function CharacterEditPage() {
  const { characterId, worldId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isOverlay = !!location.state?.backgroundLocation;
  const isCreate = !characterId && !!worldId;
  const fileInputRef = useRef(null);
  const charImportRef = useRef(null);

  const [character, setCharacter] = useState(null);
  const [loading, setLoading] = useState(!isCreate);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [sealKey, setSealKey] = useState(0);
  const [importing, setImporting] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [postPrompt, setPostPrompt] = useState('');
  const [firstMessage, setFirstMessage] = useState('');
  const [avatarPath, setAvatarPath] = useState(null);
  const [stateFields, setStateFields] = useState([]);
  const [reloadKey, setReloadKey] = useState(0);

  // 创建模式：从 sessionStorage 恢复草稿
  useEffect(() => {
    if (!isCreate) return;
    try {
      const draft = JSON.parse(sessionStorage.getItem('character_create_draft') || '{}');
      if (draft.name != null) setName(draft.name);
      if (draft.description != null) setDescription(draft.description);
      if (draft.systemPrompt != null) setSystemPrompt(draft.systemPrompt);
      if (draft.postPrompt != null) setPostPrompt(draft.postPrompt);
      if (draft.firstMessage != null) setFirstMessage(draft.firstMessage);
    } catch {
      /* 忽略无效草稿 */
    }
  }, [isCreate]);

  // 创建模式：自动保存草稿
  useEffect(() => {
    if (!isCreate) return;
    sessionStorage.setItem('character_create_draft', JSON.stringify({ name, description, systemPrompt, postPrompt, firstMessage }));
  }, [name, systemPrompt, postPrompt, firstMessage, isCreate]);

  useEffect(() => {
    if (isCreate) return;
    Promise.all([
      getCharacter(characterId),
      getCharacterStateValues(characterId),
    ]).then(([c, fields]) => {
      setCharacter(c);
      setName(c.name);
      setDescription(c.description ?? '');
      setSystemPrompt(c.system_prompt ?? '');
      setPostPrompt(c.post_prompt ?? '');
      setFirstMessage(c.first_message ?? '');
      setAvatarPath(c.avatar_path);
      setStateFields(fields);
      setLoading(false);
    });
  }, [characterId, reloadKey, isCreate]);

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
      if (isCreate) {
        const newChar = await createCharacter(worldId, {
          name: name.trim(),
          description: description.trim(),
          system_prompt: systemPrompt,
          post_prompt: postPrompt,
          first_message: firstMessage,
        });
        window.dispatchEvent(new Event('we:character-updated'));
        sessionStorage.removeItem('character_create_draft');
        navigate(`/characters/${newChar.id}/edit`, { replace: true, state: location.state });
      } else {
        await updateCharacter(characterId, {
          name: name.trim(),
          description: description.trim(),
          system_prompt: systemPrompt,
          post_prompt: postPrompt,
          first_message: firstMessage,
        });
        window.dispatchEvent(new Event('we:character-updated'));
        navigate(-1);
      }
    } catch (e) {
      setSaveError(e.message);
    } finally {
      setSaving(false);
    }
  }

  function handleClose() {
    navigate(-1);
  }

  const avatarUrl = getAvatarUrl(avatarPath);
  const avatarColor = getAvatarColor(character?.id);

  const basicTab = {
    key: 'basic',
    label: '角色设定',
    content: (
      <div className="we-edit-form-stack">
        {!isCreate && (
          <AvatarUpload
            name={name}
            avatarUrl={avatarUrl}
            avatarColor={avatarColor}
            avatarUploading={avatarUploading}
            onAvatarClick={handleAvatarClick}
            fileInputRef={fileInputRef}
            onFileChange={handleFileChange}
          />
        )}
        <FormGroup label="名称" required>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="角色的名字" autoFocus={isCreate} />
        </FormGroup>
        <FormGroup label="简介" hint="纯展示用途，不注入提示词">
          <textarea
            className="we-textarea"
            rows={3}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="一句话介绍这个角色…"
          />
        </FormGroup>
        <FormGroup label="人设">
          <MarkdownEditor value={systemPrompt} onChange={setSystemPrompt} placeholder="角色的性格、背景、说话风格……" minHeight={144} />
        </FormGroup>
        <FormGroup label="后置提示词">
          <MarkdownEditor value={postPrompt} onChange={setPostPrompt} placeholder="每次对话附加的角色级指令，例如特定的回复格式……" minHeight={72} />
        </FormGroup>
        <FormGroup label="开场白">
          <MarkdownEditor value={firstMessage} onChange={setFirstMessage} placeholder="角色在对话开始时主动说的第一句话，留空则由用户先开口" minHeight={96} />
        </FormGroup>
        {saveError && <p className="we-edit-error">{saveError}</p>}
        <div className="we-edit-save-row">
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? (isCreate ? '创建中…' : '保存中…') : (isCreate ? '创建角色' : '保存')}
          </Button>
        </div>
      </div>
    ),
  };

  const sections = isCreate
    ? [basicTab]
    : [
        basicTab,
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
          key: 'export',
          label: '导入导出',
          content: (
            <div>
              <div className="we-edit-form-group">
                <h3 className="we-edit-subsection-title">导出角色卡</h3>
                <p className="we-edit-hint">将此角色导出为 .wechar.json 文件，包含所有配置和状态字段定义。</p>
                <div className="we-edit-btn-spacer">
                  <Button variant="secondary" onClick={handleExport} disabled={exporting}>
                    {exporting ? '导出中…' : '导出 .wechar.json'}
                  </Button>
                </div>
              </div>
              <div className="we-edit-form-group">
                <h3 className="we-edit-subsection-title">导入角色卡</h3>
                <p className="we-edit-hint">导入 .wechar.json 将在当前世界创建一个新角色（不覆盖当前角色）。</p>
                <div className="we-edit-btn-spacer">
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

  return (
    <>
      <EditPageShell
        loading={loading}
        isOverlay={isOverlay}
        onClose={handleClose}
        title={isCreate ? '新建角色' : (name ? `编辑角色 · ${name}` : '')}
      >
        <SectionTabs sections={sections} defaultKey="basic" />
      </EditPageShell>
      <SealStampAnimation trigger={sealKey} text="成" />
    </>
  );
}
