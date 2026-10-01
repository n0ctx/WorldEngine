import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  getPersona,
  updatePersona,
  uploadPersonaAvatar,
  getPersonaById,
  updatePersonaById,
  createPersona,
  uploadPersonaAvatarById,
  extractPersonaStateValues,
} from '../../core/api/personas';
import {
  getPersonaStateValues,
  getPersonaStateValuesByPersonaId,
  updatePersonaStateValueByPersonaId,
  getPersonaProfileDefaults,
  updatePersonaProfileDefault,
} from '../../core/api/persona-state-values';
import { downloadPersonaCard } from '../../core/api/import-export';
import Button from '../../components/ui/Button';
import CardBasicForm from '../../components/card-edit/CardBasicForm.jsx';
import CardEditTabs from '../../components/card-edit/CardEditTabs.jsx';
import { useCardEditForm } from '../../components/card-edit/useCardEditForm.js';
import EditPageShell from '../layout/EditPageShell';
import { log } from '../../core/utils/logger.js';

const UPDATED_EVENT = 'we:persona-updated';
const PROMPTS = [{ key: 'systemPrompt', label: '人设', placeholder: '你的身份、背景等', minHeight: 120 }];

export default function PersonaEditPage() {
  const { worldId, personaId: personaIdParam } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isOverlay = !!location.state?.backgroundLocation;
  // 路由 /personas/new 中 'new' 是字面路径段而非参数，personaIdParam 为 undefined
  const isNew = location.pathname.endsWith('/personas/new');

  const form = useCardEditForm({ isCreate: isNew, draftKey: 'persona_create_draft', promptKeys: ['systemPrompt'], updatedEvent: UPDATED_EVENT });
  const { applyLoaded, failLoad, reloadKey } = form;
  const [saving, setSaving] = useState(false);
  // 加载完成后的实际 persona id（新建模式下为 null，直到创建成功）
  const [resolvedPersonaId, setResolvedPersonaId] = useState(null);

  useEffect(() => {
    if (isNew) return;
    const apply = ([p, stateFields, profileRows]) => {
      setResolvedPersonaId(p.id);
      applyLoaded(
        { name: p.name ?? '', description: p.description ?? '', systemPrompt: p.system_prompt ?? '' },
        { avatarPath: p.avatar_path, stateFields, profileRows },
      );
    };
    const handleLoadError = (err) => {
      log.error('persona_edit.load_failed', err);
      failLoad(err.message || '人设加载失败');
    };

    if (personaIdParam) {
      // 按 id 加载，状态值也按该 persona 的 id 精确拉取
      Promise.all([
        getPersonaById(personaIdParam),
        getPersonaStateValuesByPersonaId(worldId, personaIdParam),
        getPersonaProfileDefaults(personaIdParam),
      ]).then(apply).catch(handleLoadError);
    } else {
      // 兼容旧路由 /worlds/:worldId/persona（加载 active persona）
      getPersona(worldId)
        .then((p) => Promise.all([p, getPersonaStateValues(worldId), getPersonaProfileDefaults(p.id)]))
        .then(apply)
        .catch(handleLoadError);
    }
  }, [worldId, personaIdParam, isNew, reloadKey, applyLoaded, failLoad]);

  const handleAvatarFile = form.uploadAvatar(
    (file) => (resolvedPersonaId ? uploadPersonaAvatarById(resolvedPersonaId, file) : uploadPersonaAvatar(worldId, file)),
    'persona.avatar.upload_failed',
  );

  async function handleSave() {
    const body = { name: form.name, description: form.description, system_prompt: form.prompts.systemPrompt };
    setSaving(true);
    try {
      if (isNew) {
        const persona = await createPersona(worldId, body);
        form.clearDraft();
        window.dispatchEvent(new Event(UPDATED_EVENT));
        if (isOverlay) {
          navigate(-1);
          return;
        }
        form.setLoading(true);
        setSaving(false);
        // 替换路由为编辑页（不在历史里留下 /new）
        navigate(`/worlds/${worldId}/personas/${persona.id}/edit`, { replace: true });
      } else {
        if (resolvedPersonaId) await updatePersonaById(resolvedPersonaId, body);
        else await updatePersona(worldId, body);
        window.dispatchEvent(new Event(UPDATED_EVENT));
        navigate(-1);
      }
    } catch (err) {
      log.error('persona.save_failed', err, { toast: `保存失败：${err.message}` });
      setSaving(false);
    }
  }

  async function handleExport() {
    if (!resolvedPersonaId) return;
    try {
      await downloadPersonaCard(resolvedPersonaId, `${form.name || '玩家'}.wepersona.json`);
    } catch (err) {
      log.error('persona.export_failed', err, { toast: `导出失败：${err.message}` });
    }
  }

  const basicTab = {
    key: 'basic',
    label: '玩家设定',
    content: (
      <CardBasicForm
        form={form}
        avatarSeed={resolvedPersonaId || personaIdParam || worldId}
        onAvatarFile={handleAvatarFile}
        nameField={{ label: '玩家名', placeholder: '你在这个世界里的名字' }}
        descriptionPlaceholder="一句话介绍这个玩家…"
        prompts={PROMPTS}
        saving={saving}
        saveLabel={isNew ? '创建' : '保存'}
        savingLabel="保存中…"
        onSave={handleSave}
      />
    ),
  };

  const stateInit = isNew ? null : {
    profileRows: form.profileRows,
    stateFields: form.stateFields,
    writeProfile: (fieldKey, valueJson) => updatePersonaProfileDefault(resolvedPersonaId, fieldKey, valueJson),
    writeState: (fieldKey, valueJson) => updatePersonaStateValueByPersonaId(worldId, resolvedPersonaId, fieldKey, valueJson),
    extract: () => extractPersonaStateValues(resolvedPersonaId),
    onChanged: form.reload,
  };

  const exportAction = isNew ? null : (
    <Button variant="secondary" size="sm" onClick={handleExport}>导出玩家卡</Button>
  );

  return (
    <EditPageShell
      loading={form.loading}
      loadError={form.loadError}
      onRetry={form.retryLoad}
      dirty={form.dirty}
      isOverlay={isOverlay}
      onClose={() => navigate(-1)}
      title={isNew ? '创建玩家' : '编辑玩家卡'}
      headerActions={exportAction}
    >
      <CardEditTabs basicTab={basicTab} stateInit={stateInit} />
    </EditPageShell>
  );
}
