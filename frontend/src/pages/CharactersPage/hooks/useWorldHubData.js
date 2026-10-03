import { useState, useEffect, useCallback } from 'react';
import { getWorld } from '../../../core/api/worlds';
import { loadWorldContent } from '../../../core/data/loadWorldContent.js';
import { getWorldTimeline } from '../../../core/api/sessions';
import { listCharacterStateFields } from '../../../core/api/character-state-fields';
import { listPersonaStateFields } from '../../../core/api/persona-state-fields';

// ── 世界层数据加载：world / characters / personas / entries / 状态字段数 / timeline ──

export function useWorldHubData(worldId) {
  const [world, setWorld] = useState(null);
  const [characters, setCharacters] = useState([]);
  const [personas, setPersonas] = useState([]);
  const [entries, setEntries] = useState([]);
  // 世界、角色、玩家三类状态字段的合计，与规则页概览的「合计」同口径
  const [stateFieldCount, setStateFieldCount] = useState(0);
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [w, content, characterFields, personaFields, tl] = await Promise.all([
        getWorld(worldId),
        loadWorldContent(worldId),
        listCharacterStateFields(worldId),
        listPersonaStateFields(worldId),
        getWorldTimeline(worldId),
      ]);
      setWorld(w);
      setCharacters(content.characters);
      setPersonas(content.personas);
      setEntries(content.worldEntries);
      setStateFieldCount(content.worldFields.length + characterFields.length + personaFields.length);
      setTimeline(tl);
    } catch (err) {
      setLoadError(err.message || '读取失败');
    } finally {
      setLoading(false);
    }
  }, [worldId]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void loadData();
    }, 0);
    return () => clearTimeout(timeoutId);
  }, [loadData, reloadKey]);

  useEffect(() => {
    const h = () => setReloadKey((k) => k + 1);
    window.addEventListener('we:world-updated', h);
    window.addEventListener('we:character-updated', h);
    window.addEventListener('we:persona-updated', h);
    return () => {
      window.removeEventListener('we:world-updated', h);
      window.removeEventListener('we:character-updated', h);
      window.removeEventListener('we:persona-updated', h);
    };
  }, []);

  return {
    world, setWorld,
    characters, setCharacters,
    personas, setPersonas,
    entries,
    stateFieldCount,
    timeline, setTimeline,
    loading,
    loadError,
    loadData,
  };
}
