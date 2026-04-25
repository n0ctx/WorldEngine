import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { getWorld, updateWorld, createWorld, uploadWorldCover } from '../api/worlds';
import { downloadWorldCard, importWorld, readJsonFile } from '../api/import-export';

import StateFieldList from '../components/state/StateFieldList';
import AvatarUpload from '../components/ui/AvatarUpload';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import SectionTabs from '../components/book/SectionTabs';
import SealStampAnimation from '../components/book/SealStampAnimation';
import EditPageShell from '../components/ui/EditPageShell';
import FormGroup from '../components/ui/FormGroup';
import {
  listWorldStateFields, createWorldStateField,
  updateWorldStateField, deleteWorldStateField, reorderWorldStateFields,
  syncDiaryTimeField,
} from '../api/world-state-fields';
import { getConfig } from '../api/config';
import { getAvatarUrl, getAvatarColor } from '../utils/avatar';
import { getWorldStateValues, updateWorldStateValue } from '../api/world-state-values.js';
import {
  listCharacterStateFields, createCharacterStateField,
  updateCharacterStateField, deleteCharacterStateField, reorderCharacterStateFields,
} from '../api/character-state-fields';
import {
  listPersonaStateFields, createPersonaStateField,
  updatePersonaStateField, deletePersonaStateField, reorderPersonaStateFields,
} from '../api/persona-state-fields';
import StateValueField from '../components/state/StateValueField';
import { pushErrorToast } from '../utils/toast';

export default function WorldEditPage() {
  const { worldId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isOverlay = !!location.state?.backgroundLocation;
  const isCreate = !worldId;
  const worldImportRef = useRef(null);

  const [loading, setLoading] = useState(!isCreate);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [sealKey, setSealKey] = useState(0);
  const [importing, setImporting] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [coverPath, setCoverPath] = useState(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const coverFileInputRef = useRef(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [temperature, setTemperature] = useState('');
  const [maxTokens, setMaxTokens] = useState('');
  const [stateFields, setStateFields] = useState([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [diaryChatDateMode, setDiaryChatDateMode] = useState('virtual');

  // 页面进入时同步 diary_time 字段，并获取日记日期模式
  useEffect(() => {
    if (isCreate || !worldId) return;
    syncDiaryTimeField(worldId).catch(() => {});
    getConfig().then((c) => setDiaryChatDateMode(c.diary?.chat?.date_mode ?? 'virtual')).catch(() => {});
  }, [worldId, isCreate]);

  // 创建模式：从 sessionStorage 恢复草稿
  useEffect(() => {
    if (!isCreate) return;
    try {
      const draft = JSON.parse(sessionStorage.getItem('world_create_draft') || '{}');
      if (draft.name != null) setName(draft.name);
      if (draft.description != null) setDescription(draft.description);
    } catch {
      /* 忽略无效草稿 */
    }
  }, [isCreate]);

  // 创建模式：自动保存草稿
  useEffect(() => {
    if (!isCreate) return;
    sessionStorage.setItem('world_create_draft', JSON.stringify({ name, description }));
  }, [name, description, isCreate]);

  useEffect(() => {
    if (isCreate) return;
    Promise.all([
      getWorld(worldId),
      getWorldStateValues(worldId),
    ]).then(([w, fields]) => {
      setName(w.name ?? '');
      setDescription(w.description ?? '');
      setTemperature(w.temperature != null ? String(w.temperature) : '');
      setMaxTokens(w.max_tokens != null ? String(w.max_tokens) : '');
      setCoverPath(w.cover_path ?? null);
      setStateFields(fields);
      setLoading(false);
    });
  }, [worldId, reloadKey, isCreate]);

  useEffect(() => {
    const h = () => setReloadKey((k) => k + 1);
    window.addEventListener('we:world-updated', h);
    return () => window.removeEventListener('we:world-updated', h);
  }, []);

  async function handleStateValueSave(fieldKey, valueJson) {
    try {
      await updateWorldStateValue(worldId, fieldKey, valueJson);
    } catch (err) {
      pushErrorToast(err.message || '世界状态默认值保存失败');
    }
  }

  async function handleSave() {
    if (!name.trim()) { setSaveError('名称为必填项'); return; }
    setSaving(true);
    setSaveError('');
    try {
      if (isCreate) {
        const world = await createWorld({
          name: name.trim(),
          description: description.trim(),
        });
        window.dispatchEvent(new Event('we:world-updated'));
        sessionStorage.removeItem('world_create_draft');
        navigate(`/worlds/${world.id}/edit`, { replace: true, state: location.state });
      } else {
        await updateWorld(worldId, {
          name: name.trim(),
          description: description.trim(),
          temperature: temperature === '' ? null : Number(temperature),
          max_tokens: maxTokens === '' ? null : parseInt(maxTokens, 10),
        });
        window.dispatchEvent(new Event('we:world-updated'));
        navigate(-1);
      }
    } catch (e) {
      setSaveError(e.message);
      setSaving(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const safeName = (name || 'world').replace(/[^\w\u4e00-\u9fa5]/g, '_');
      await downloadWorldCard(worldId, `${safeName}.weworld.json`);
      setSealKey(k => k + 1);
    } catch (err) {
      pushErrorToast(`导出失败：${err.message}`);
    } finally {
      setExporting(false);
    }
  }

  async function handleImportWorldFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const data = await readJsonFile(file);
      await importWorld(data);
      navigate('/worlds');
    } catch (err) {
      pushErrorToast(`导入失败：${err.message}`);
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  }

  async function handleCoverFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverUploading(true);
    try {
      const result = await uploadWorldCover(worldId, file);
      setCoverPath(result.cover_path);
      window.dispatchEvent(new Event('we:world-updated'));
    } catch (err) {
      pushErrorToast(`封面上传失败：${err.message}`);
    } finally {
      setCoverUploading(false);
      e.target.value = '';
    }
  }

  function handleClose() {
    navigate(-1);
  }

  const sections = [
    {
      key: 'basic',
      label: '基础设定',
      content: (
        <div className="we-edit-form-stack">
          <FormGroup label="名称" required>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="世界的名称" autoFocus={isCreate} />
          </FormGroup>
          <FormGroup label="简介" hint="纯展示用途，不注入提示词">
            <textarea
              className="we-textarea"
              rows={3}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="一句话介绍这个世界…"
            />
          </FormGroup>
          {saveError && <p className="we-edit-error">{saveError}</p>}
          <div className="we-edit-save-row">
            <Button variant="primary" onClick={handleSave} disabled={saving}>
              {saving ? (isCreate ? '创建中…' : '保存中…') : (isCreate ? '创建世界' : '保存')}
            </Button>
          </div>
          {!isCreate && (
            <FormGroup label="封面图" hint="铺满世界卡片背景，建议比例 4:3 或横向图片">
              <AvatarUpload
                name={name}
                avatarUrl={getAvatarUrl(coverPath)}
                avatarColor={getAvatarColor(worldId)}
                avatarUploading={coverUploading}
                fileInputRef={coverFileInputRef}
                onAvatarClick={() => coverFileInputRef.current?.click()}
                onFileChange={handleCoverFileChange}
              />
            </FormGroup>
          )}
        </div>
      ),
    },
    {
      key: 'llm',
      label: 'LLM 参数',
      content: (
        <div className="we-edit-form-stack">
          <FormGroup label="Temperature" hint="覆盖全局 temperature，留空则使用全局配置（世界级 > 全局）">
            <Input
              type="number"
              step="0.01"
              min="0"
              max="2"
              value={temperature}
              onChange={e => setTemperature(e.target.value)}
              placeholder="留空则使用全局配置"
            />
          </FormGroup>
          <FormGroup label="最大 Token 数" hint="覆盖全局 max_tokens，留空则使用全局配置">
            <Input
              type="number"
              step="1"
              min="1"
              value={maxTokens}
              onChange={e => setMaxTokens(e.target.value)}
              placeholder="留空则使用全局配置"
            />
          </FormGroup>
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
      key: 'state_templates',
      label: '状态模板',
      content: (
        <div>
          {stateFields.length > 0 && (
            <div className="we-edit-form-group">
              <h3 className="we-edit-subsection-title">世界默认状态值</h3>
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
              <div className="we-edit-state-sep" />
            </div>
          )}
          <StateFieldList
            scope="world"
            worldId={worldId}
            diaryDateMode={diaryChatDateMode}
            listFn={listWorldStateFields}
            createFn={createWorldStateField}
            updateFn={updateWorldStateField}
            deleteFn={deleteWorldStateField}
            reorderFn={reorderWorldStateFields}
          />
          <div className="we-edit-state-sep" />
          <StateFieldList
            scope="character"
            worldId={worldId}
            listFn={listCharacterStateFields}
            createFn={createCharacterStateField}
            updateFn={updateCharacterStateField}
            deleteFn={deleteCharacterStateField}
            reorderFn={reorderCharacterStateFields}
          />
          <div className="we-edit-state-sep" />
          <StateFieldList
            scope="persona"
            worldId={worldId}
            listFn={listPersonaStateFields}
            createFn={createPersonaStateField}
            updateFn={updatePersonaStateField}
            deleteFn={deletePersonaStateField}
            reorderFn={reorderPersonaStateFields}
          />
        </div>
      ),
    },
    {
      key: 'export',
      label: '导入导出',
      content: (
        <div>
          <div className="we-edit-form-group">
            <h3 className="we-edit-subsection-title">导出世界卡</h3>
            <p className="we-edit-hint">将此世界导出为 .weworld.json 文件，包含所有配置和状态字段定义。</p>
            <div className="we-edit-btn-spacer">
              <Button variant="secondary" onClick={handleExport} disabled={exporting}>
                {exporting ? '导出中…' : '导出 .weworld.json'}
              </Button>
            </div>
          </div>
          <div className="we-edit-state-sep" />
          <div className="we-edit-form-group">
            <h3 className="we-edit-subsection-title">导入世界卡</h3>
            <p className="we-edit-hint">导入 .weworld.json 将创建一个新世界（不覆盖当前世界）。</p>
            <div className="we-edit-btn-spacer">
              <Button variant="secondary" onClick={() => worldImportRef.current?.click()} disabled={importing}>
                {importing ? '导入中…' : '导入世界卡…'}
              </Button>
              <input
                ref={worldImportRef}
                type="file"
                accept=".json,.weworld.json"
                className="hidden"
                onChange={handleImportWorldFile}
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
        title={isCreate ? '新建世界' : (name ? `编辑世界 · ${name}` : '')}
      >
        <SectionTabs sections={sections} defaultKey="basic" />
      </EditPageShell>
      <SealStampAnimation trigger={sealKey} text="成" />
    </>
  );
}
