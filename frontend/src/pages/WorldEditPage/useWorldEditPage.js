import { useEffect, useState } from 'react';
import { createWorld, getWorld, updateWorld } from '../../core/api/worlds';
import { getConfig } from '../../core/api/config';
import { useCreateDraftIdentity } from '../../core/hooks/useCreateDraftIdentity.js';
import { useWorldUpdateReload } from '../../core/hooks/useWorldUpdateReload.js';
import { syncDiaryTimeField } from '../../core/api/world-state-fields';
import { log } from '../../core/utils/logger.js';

function readCreateDraft() {
  try {
    return JSON.parse(sessionStorage.getItem('world_create_draft') || '{}');
  } catch {
    return {};
  }
}

export default function useWorldEditPage({ worldId, isCreate, isOverlay, navigate, onWorldLoaded }) {
  const [loading, setLoading] = useState(!isCreate);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [temperature, setTemperature] = useState('');
  const [maxTokens, setMaxTokens] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [diaryChatDateMode, setDiaryChatDateMode] = useState('virtual');
  const [saved, setSaved] = useState(null);
  const { name, setName, description, setDescription } = useCreateDraftIdentity(isCreate, readCreateDraft);
  const dirty = !!saved && (
    name !== saved.name || description !== saved.description
    || temperature !== saved.temperature || maxTokens !== saved.maxTokens
  );

  useEffect(() => {
    if (isCreate || !worldId) return;
    syncDiaryTimeField(worldId).catch(() => {});
    getConfig().then((config) => setDiaryChatDateMode(config.diary?.chat?.date_mode ?? 'virtual')).catch(() => {});
  }, [worldId, isCreate]);

  useEffect(() => {
    if (!isCreate) return;
    sessionStorage.setItem('world_create_draft', JSON.stringify({ name, description }));
  }, [name, description, isCreate]);

  useEffect(() => {
    if (isCreate) return;
    getWorld(worldId).then((world) => {
      const loaded = {
        name: world.name ?? '',
        description: world.description ?? '',
        temperature: world.temperature != null ? String(world.temperature) : '',
        maxTokens: world.max_tokens != null ? String(world.max_tokens) : '',
      };
      setSaved(loaded);
      setName(loaded.name);
      setDescription(loaded.description);
      setTemperature(loaded.temperature);
      setMaxTokens(loaded.maxTokens);
      onWorldLoaded(world);
      setLoading(false);
    }).catch((error) => {
      log.error('world_edit.load_failed', error);
      setLoadError(error.message || '世界加载失败');
    });
  }, [worldId, reloadKey, isCreate, setName, setDescription, onWorldLoaded]);

  useWorldUpdateReload(setReloadKey);

  function retryLoad() {
    setLoadError('');
    setLoading(true);
    setReloadKey((key) => key + 1);
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
    } catch (error) {
      setSaveError(error.message);
      setSaving(false);
    }
  }

  function handleClose() {
    navigate(-1);
  }

  return {
    loading,
    loadError,
    saving,
    saveError,
    name,
    setName,
    description,
    setDescription,
    temperature,
    setTemperature,
    maxTokens,
    setMaxTokens,
    diaryChatDateMode,
    dirty,
    retryLoad,
    handleSave,
    handleClose,
  };
}
