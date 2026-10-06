import { useEffect, useState } from 'react';
import { createWorld, getWorld, updateWorld } from '../../core/api/worlds';
import { getConfig } from '../../core/api/config';
import { useCreateDraftIdentity } from '../../core/hooks/useCreateDraftIdentity.js';
import { useWorldUpdateReload } from '../../core/hooks/useWorldUpdateReload.js';
import { keepEdited, useFormBaseline } from '../../core/hooks/useFormBaseline.js';
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
  const [savedKey, setSavedKey] = useState(0);
  const [temperature, setTemperature] = useState('');
  const [maxTokens, setMaxTokens] = useState('');
  const [openingTime, setOpeningTime] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [diaryChatDateMode, setDiaryChatDateMode] = useState('virtual');
  const { name, setName, description, setDescription } = useCreateDraftIdentity(isCreate, readCreateDraft);
  const { dirty, baselineRef, setBaseline } = useFormBaseline({ name, description, temperature, maxTokens });

  useEffect(() => {
    if (isCreate || !worldId) return;
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
      // 重新取数（世界更新事件、上传封面、改主色后）不冲掉未保存的输入：只替换基准之后没改过的字段
      const base = baselineRef.current;
      setName(keepEdited(base, 'name', loaded));
      setDescription(keepEdited(base, 'description', loaded));
      setTemperature(keepEdited(base, 'temperature', loaded));
      setMaxTokens(keepEdited(base, 'maxTokens', loaded));
      setBaseline(loaded);
      onWorldLoaded(world);
      setLoading(false);
    }).catch((error) => {
      log.error('world_edit.load_failed', error);
      setLoadError(error.message || '世界加载失败');
    });
  }, [worldId, reloadKey, isCreate, baselineRef, setName, setDescription, setBaseline, onWorldLoaded]);

  useWorldUpdateReload(setReloadKey);

  function retryLoad() {
    setLoadError('');
    setLoading(true);
    setReloadKey((key) => key + 1);
  }

  async function handleSave() {
    if (!name.trim()) { setSaveError('名称为必填项'); return; }
    if (isCreate && !openingTime) { setSaveError('开场时间为必填项'); return; }
    setSaving(true);
    setSaveError('');
    try {
      if (isCreate) {
        const world = await createWorld({
          name: name.trim(),
          description: description.trim(),
          profile_defaults: { time: openingTime },
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
        const sent = { name, description, temperature, maxTokens };
        const stored = { ...sent, name: name.trim(), description: description.trim() };
        await updateWorld(worldId, {
          name: stored.name,
          description: stored.description,
          temperature: temperature === '' ? null : Number(temperature),
          max_tokens: maxTokens === '' ? null : parseInt(maxTokens, 10),
        });
        // 提交后又改过的字段保留输入，没改过的换成写进服务端的值
        setName(keepEdited(sent, 'name', stored));
        setDescription(keepEdited(sent, 'description', stored));
        setBaseline(stored);
        setSaving(false);
        setSavedKey((key) => key + 1);
        window.dispatchEvent(new Event('we:world-updated'));
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
    savedKey,
    name,
    setName,
    description,
    setDescription,
    temperature,
    setTemperature,
    maxTokens,
    setMaxTokens,
    openingTime,
    setOpeningTime,
    diaryChatDateMode,
    dirty,
    retryLoad,
    handleSave,
    handleClose,
  };
}
