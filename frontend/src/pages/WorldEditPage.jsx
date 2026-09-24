import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { getWorld, updateWorld, createWorld, uploadWorldCover } from '../core/api/worlds';
import { extractAccentColorFromFile, extractAccentColorFromImageSrc, FALLBACK_ACCENT_HEX } from '../core/utils/extractAccentColor.js';

import StateFieldList from '../components/state/StateFieldList';
import AvatarUpload from '../components/ui/AvatarUpload';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import SectionTabs from '../components/ui/SectionTabs.jsx';
import EditPageShell from './layout/EditPageShell';
import FormGroup from '../components/ui/FormGroup';
import ToggleSwitch from '../components/ui/ToggleSwitch';
import {
  listWorldStateFields, createWorldStateField,
  updateWorldStateField, deleteWorldStateField, reorderWorldStateFields,
  syncDiaryTimeField,
} from '../core/api/world-state-fields';
import { getConfig } from '../core/api/config';
import { getAvatarUrl, getAvatarColor } from '../core/utils/avatar';
import {
  listCharacterStateFields, createCharacterStateField,
  updateCharacterStateField, deleteCharacterStateField, reorderCharacterStateFields,
} from '../core/api/character-state-fields';
import {
  listPersonaStateFields, createPersonaStateField,
  updatePersonaStateField, deletePersonaStateField, reorderPersonaStateFields,
} from '../core/api/persona-state-fields';
import { log } from '../core/utils/logger.js';

function readCreateDraft() {
  try {
    return JSON.parse(sessionStorage.getItem('world_create_draft') || '{}');
  } catch {
    return {};
  }
}

export default function WorldEditPage() {
  const { worldId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isOverlay = !!location.state?.backgroundLocation;
  const isCreate = !worldId;

  const [loading, setLoading] = useState(!isCreate);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [coverPath, setCoverPath] = useState(null);
  const [coverBustKey, setCoverBustKey] = useState(0);
  const [coverUploading, setCoverUploading] = useState(false);
  const coverFileInputRef = useRef(null);
  const [accentColor, setAccentColor] = useState(null);
  const [accentSource, setAccentSource] = useState('auto');
  const [accentSaving, setAccentSaving] = useState(false);

  // 创建模式在首次渲染时同步恢复草稿：放进 effect 会晚于下方的草稿自动保存，被空表单先覆盖
  const [draft] = useState(() => (isCreate ? readCreateDraft() : {}));
  const [name, setName] = useState(draft.name ?? '');
  const [description, setDescription] = useState(draft.description ?? '');
  const [temperature, setTemperature] = useState('');
  const [maxTokens, setMaxTokens] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [diaryChatDateMode, setDiaryChatDateMode] = useState('virtual');
  // 最近一次从服务端加载的表单值，用于判断关闭时是否有未保存修改
  const [saved, setSaved] = useState(null);
  const dirty = !!saved && (
    name !== saved.name || description !== saved.description
    || temperature !== saved.temperature || maxTokens !== saved.maxTokens
  );

  // 页面进入时同步 diary_time 字段，并获取日记日期模式
  useEffect(() => {
    if (isCreate || !worldId) return;
    syncDiaryTimeField(worldId).catch(() => {});
    getConfig().then((c) => setDiaryChatDateMode(c.diary?.chat?.date_mode ?? 'virtual')).catch(() => {});
  }, [worldId, isCreate]);

  // 创建模式：自动保存草稿
  useEffect(() => {
    if (!isCreate) return;
    sessionStorage.setItem('world_create_draft', JSON.stringify({ name, description }));
  }, [name, description, isCreate]);

  useEffect(() => {
    if (isCreate) return;
    getWorld(worldId).then((w) => {
      const loaded = {
        name: w.name ?? '',
        description: w.description ?? '',
        temperature: w.temperature != null ? String(w.temperature) : '',
        maxTokens: w.max_tokens != null ? String(w.max_tokens) : '',
      };
      setSaved(loaded);
      setName(loaded.name);
      setDescription(loaded.description);
      setTemperature(loaded.temperature);
      setMaxTokens(loaded.maxTokens);
      setCoverPath(w.cover_path ?? null);
      setAccentColor(w.accent_color ?? null);
      setAccentSource(w.accent_source === 'manual' ? 'manual' : 'auto');
      setLoading(false);
    }).catch((err) => {
      log.error('world_edit.load_failed', err);
      setLoadError(err.message || '世界加载失败');
    });
  }, [worldId, reloadKey, isCreate]);

  function retryLoad() {
    setLoadError('');
    setLoading(true);
    setReloadKey((k) => k + 1);
  }

  useEffect(() => {
    const h = () => setReloadKey((k) => k + 1);
    window.addEventListener('we:world-updated', h);
    return () => window.removeEventListener('we:world-updated', h);
  }, []);

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
        if (isOverlay) {
          navigate(-1);
          return;
        }
        setLoading(true);
        setSaving(false);
        navigate(`/worlds/${world.id}/edit`, { replace: true });
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



  async function handleCoverFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverUploading(true);
    try {
      // 主色手工指定后不再随封面自动重算；仅 'auto' 时才在前端算一次新色随封面一起提交。
      const nextAccentColor = accentSource === 'manual' ? null : await extractAccentColorFromFile(file);
      const result = await uploadWorldCover(worldId, file, nextAccentColor);
      setCoverPath(result.cover_path);
      setCoverBustKey(Date.now());
      if (accentSource !== 'manual') {
        setAccentColor(result.accent_color ?? null);
        setAccentSource(result.accent_source === 'manual' ? 'manual' : 'auto');
      }
      window.dispatchEvent(new Event('we:world-updated'));
    } catch (err) {
      log.error('world.cover.upload_failed', err, { toast: `封面上传失败：${err.message}` });
    } finally {
      setCoverUploading(false);
      e.target.value = '';
    }
  }

  async function handleAccentSourceToggle(nextIsManual) {
    setAccentSaving(true);
    try {
      if (nextIsManual) {
        const manualColor = accentColor ?? FALLBACK_ACCENT_HEX;
        await updateWorld(worldId, { accent_color: manualColor, accent_source: 'manual' });
        setAccentColor(manualColor);
        setAccentSource('manual');
      } else {
        // 切回自动：有封面则立即按当前封面重算一次，没有封面则清空、退回主题默认色。
        const recomputed = coverPath ? await extractAccentColorFromImageSrc(getAvatarUrl(coverPath)) : null;
        await updateWorld(worldId, { accent_color: recomputed, accent_source: 'auto' });
        setAccentColor(recomputed);
        setAccentSource('auto');
      }
      window.dispatchEvent(new Event('we:world-updated'));
    } catch (err) {
      log.error('world.accent.update_failed', err, { toast: `主色更新失败：${err.message}` });
    } finally {
      setAccentSaving(false);
    }
  }

  async function handleAccentColorPick(hex) {
    setAccentColor(hex);
    setAccentSaving(true);
    try {
      await updateWorld(worldId, { accent_color: hex, accent_source: 'manual' });
      window.dispatchEvent(new Event('we:world-updated'));
    } catch (err) {
      log.error('world.accent.update_failed', err, { toast: `主色更新失败：${err.message}` });
    } finally {
      setAccentSaving(false);
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
            <FormGroup label="封面图" hint="铺满世界卡片背景，建议比例 16:10 或横向图片">
              <AvatarUpload
                name={name}
                avatarUrl={coverBustKey ? `${getAvatarUrl(coverPath)}?t=${coverBustKey}` : getAvatarUrl(coverPath)}
                avatarColor={getAvatarColor(worldId)}
                avatarUploading={coverUploading}
                fileInputRef={coverFileInputRef}
                onAvatarClick={() => coverFileInputRef.current?.click()}
                onFileChange={handleCoverFileChange}
                shape="rect"
                hint="点击上传封面图"
              />
            </FormGroup>
          )}
          {!isCreate && (
            <FormGroup
              label="主色"
              hint={accentSource === 'manual' ? '已手工指定，封面变化不再自动覆盖' : '自动跟随封面：从封面图取主导色，替代主题默认的界面主色'}
            >
              <div className="we-edit-accent-row">
                <ToggleSwitch
                  checked={accentSource === 'manual'}
                  onChange={handleAccentSourceToggle}
                  disabled={accentSaving}
                />
                <span className="we-edit-accent-label">{accentSource === 'manual' ? '手动指定' : '自动（跟随封面）'}</span>
                {accentSource === 'manual' && (
                  <input
                    type="color"
                    className="we-edit-accent-swatch"
                    value={accentColor ?? FALLBACK_ACCENT_HEX}
                    disabled={accentSaving}
                    onChange={(e) => handleAccentColorPick(e.target.value)}
                    aria-label="选择主色"
                  />
                )}
                {accentSource !== 'manual' && (
                  <span
                    className="we-edit-accent-swatch we-edit-accent-swatch--readonly"
                    style={{ '--we-edit-accent-preview': accentColor ?? 'var(--we-color-accent)' }}
                    title={accentColor ?? '主题默认色'}
                  />
                )}
              </div>
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
    ...(!isCreate ? [{
      key: 'state_templates',
      label: '状态模板',
      content: (
        <div>
          <p className="we-config-workshop-hint">
            想以字段为中心、一站式设置各角色/玩家默认值与触发条目？
            <button
              type="button"
              className="we-workshop-entry-link"
              onClick={() => navigate(`/worlds/${worldId}/rules?tab=state`)}
            >
              前往这个世界的规则 →
            </button>
          </p>
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
    }] : []),
  ];

  return (
    <EditPageShell
      loading={loading}
      loadError={loadError}
      onRetry={retryLoad}
      dirty={dirty}
      isOverlay={isOverlay}
      onClose={handleClose}
      title={isCreate ? '新建世界' : (name ? `编辑世界 · ${name}` : '')}
    >
      <SectionTabs sections={sections} defaultKey="basic" />
    </EditPageShell>
  );
}
