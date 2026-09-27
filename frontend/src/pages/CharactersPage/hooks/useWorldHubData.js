import { useState, useEffect, useCallback } from 'react';
import { getWorld } from '../../../core/api/worlds';
import { loadWorldContent } from '../../../core/data/loadWorldContent.js';
import { getWorldTimeline } from '../../../core/api/sessions';

// ── 世界层数据加载：world / characters / personas / entries / stateFields / timeline ──

export function useWorldHubData(worldId) {
  const [world, setWorld] = useState(null);
  const [characters, setCharacters] = useState([]);
  const [personas, setPersonas] = useState([]);
  const [entries, setEntries] = useState([]);
  const [stateFields, setStateFields] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [w, content, tl] = await Promise.all([
        getWorld(worldId),
        loadWorldContent(worldId),
        getWorldTimeline(worldId),
      ]);
      setWorld(w);
      setCharacters(content.characters);
      setPersonas(content.personas);
      setEntries(content.worldEntries);
      setStateFields(content.worldFields);
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
    stateFields,
    timeline, setTimeline,
    loading,
    loadError,
    loadData,
  };
}
