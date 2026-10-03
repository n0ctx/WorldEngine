import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { getCharacter, updateCharacter, uploadAvatar, createCharacter } from '../../core/api/characters';
import { downloadCharacterCard } from '../../core/api/import-export';
import {
  getCharacterStateValues, updateCharacterStateValue, extractCharacterStateValues,
  getCharacterProfileDefaults, updateCharacterProfileDefault,
} from '../../core/api/character-state-values';
import Button from '../../components/ui/Button';
import CardBasicForm from '../../components/card-edit/CardBasicForm.jsx';
import CardEditTabs from '../../components/card-edit/CardEditTabs.jsx';
import { useCardEditForm } from '../../components/card-edit/useCardEditForm.js';
import EditPageShell from '../layout/EditPageShell';
import DoneConfirm from './components/DoneConfirm.jsx';
import { log } from '../../core/utils/logger.js';

const UPDATED_EVENT = 'we:character-updated';
const PROMPTS = [
  { key: 'systemPrompt', label: '人设', placeholder: '角色的性格、背景、说话风格……', minHeight: 144 },
  { key: 'postPrompt', label: '后置提示词', placeholder: '每次对话附加的角色级指令，例如特定的回复格式……', minHeight: 72 },
  { key: 'firstMessage', label: '开场白', placeholder: '角色在对话开始时主动说的第一句话，留空则由用户先开口', minHeight: 96 },
];

export default function CharacterEditPage() {
  const { characterId, worldId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isOverlay = !!location.state?.backgroundLocation;
  const isCreate = !characterId && !!worldId;

  const form = useCardEditForm({
    isCreate, draftKey: 'character_create_draft', promptKeys: PROMPTS.map((p) => p.key), updatedEvent: UPDATED_EVENT,
  });
  const { applyLoaded, failLoad, reloadKey } = form;
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [savedKey, setSavedKey] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [doneKey, setDoneKey] = useState(0);

  useEffect(() => {
    if (isCreate) return;
    Promise.all([
      getCharacter(characterId),
      getCharacterStateValues(characterId),
      getCharacterProfileDefaults(characterId),
    ]).then(([c, stateFields, profileRows]) => {
      applyLoaded(
        {
          name: c.name,
          description: c.description ?? '',
          systemPrompt: c.system_prompt ?? '',
          postPrompt: c.post_prompt ?? '',
          firstMessage: c.first_message ?? '',
        },
        { avatarPath: c.avatar_path, stateFields, profileRows },
      );
    }).catch((err) => {
      log.error('character_edit.load_failed', err);
      failLoad(err.message || '角色加载失败');
    });
  }, [characterId, reloadKey, isCreate, applyLoaded, failLoad]);

  const handleAvatarFile = form.uploadAvatar((file) => uploadAvatar(characterId, file), 'character.avatar.upload_failed');

  async function handleExport() {
    setExporting(true);
    try {
      const safeName = (form.name || 'character').replace(/[^\w一-龥]/g, '_');
      await downloadCharacterCard(characterId, `${safeName}.wechar.json`);
      setDoneKey((k) => k + 1);
    } catch (err) {
      log.error('character.export_failed', err, { toast: `导出失败：${err.message}` });
    } finally {
      setExporting(false);
    }
  }

  async function handleSave() {
    if (!form.name.trim()) { setSaveError('名称为必填项'); return; }
    const body = {
      name: form.name.trim(),
      description: form.description.trim(),
      system_prompt: form.prompts.systemPrompt,
      post_prompt: form.prompts.postPrompt,
      first_message: form.prompts.firstMessage,
    };
    const sent = form.values;
    setSaving(true);
    setSaveError('');
    try {
      if (isCreate) {
        const newChar = await createCharacter(worldId, body);
        window.dispatchEvent(new Event(UPDATED_EVENT));
        form.clearDraft();
        if (isOverlay) {
          navigate(-1);
          return;
        }
        form.setLoading(true);
        setSaving(false);
        navigate(`/characters/${newChar.id}/edit`, { replace: true });
      } else {
        await updateCharacter(characterId, body);
        form.markSaved(sent, { ...sent, name: body.name, description: body.description });
        setSaving(false);
        setSavedKey((k) => k + 1);
        window.dispatchEvent(new Event(UPDATED_EVENT));
      }
    } catch (e) {
      setSaveError(e.message);
      setSaving(false);
    }
  }

  const basicTab = {
    key: 'basic',
    label: '角色设定',
    content: (
      <CardBasicForm
        form={form}
        avatarSeed={characterId}
        showAvatar={!isCreate}
        onAvatarFile={handleAvatarFile}
        nameField={{ label: '名称', placeholder: '角色的名字', required: true, autoFocus: isCreate }}
        descriptionPlaceholder="一句话介绍这个角色…"
        prompts={PROMPTS}
      />
    ),
  };

  const stateInit = isCreate ? null : {
    profileRows: form.profileRows,
    stateFields: form.stateFields,
    writeProfile: (fieldKey, valueJson) => updateCharacterProfileDefault(characterId, fieldKey, valueJson),
    writeState: (fieldKey, valueJson) => updateCharacterStateValue(characterId, fieldKey, valueJson),
    extract: () => extractCharacterStateValues(characterId),
    onChanged: form.reload,
  };

  const exportAction = !isCreate && characterId ? (
    <Button variant="secondary" size="sm" onClick={handleExport} disabled={exporting}>
      {exporting ? '导出中…' : '导出角色卡'}
    </Button>
  ) : null;

  return (
    <>
      <EditPageShell
        loading={form.loading}
        loadError={form.loadError}
        onRetry={form.retryLoad}
        dirty={form.dirty}
        onClose={() => navigate(-1)}
        title={isCreate ? '新建角色' : (form.name ? `编辑角色 · ${form.name}` : '编辑角色')}
        headerActions={exportAction}
        save={{
          creating: isCreate,
          saving,
          error: saveError,
          savedKey,
          saveLabel: isCreate ? '创建角色' : '保存',
          onSave: handleSave,
        }}
      >
        <CardEditTabs basicTab={basicTab} stateInit={stateInit} />
      </EditPageShell>
      <DoneConfirm trigger={doneKey} label="已导出" />
    </>
  );
}
