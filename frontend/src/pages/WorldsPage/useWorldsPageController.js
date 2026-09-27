import { useCallback, useEffect, useRef, useState } from 'react';
import { getWorlds, deleteWorld, reorderWorlds, updateWorld } from '../../core/api/worlds';
import { getCharactersByWorld } from '../../core/api/characters';
import { useWorldUpdateReload } from '../../core/hooks/useWorldUpdateReload.js';
import { downloadWorldCard, importWorld, readJsonFile } from '../../core/api/import-export';
import { extractAccentColorFromImageSrc } from '../../core/utils/extractAccentColor.js';
import { getAvatarUrl } from '../../core/utils/avatar';
import { log } from '../../core/utils/logger.js';

const CAST_PREVIEW = 4;

export function useWorldsPageController() {
  const [worlds, setWorlds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [deletingWorld, setDeletingWorld] = useState(null);
  const [exportingWorldId, setExportingWorldId] = useState(null);
  const [importingWorld, setImportingWorld] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [actionsOpenId, setActionsOpenId] = useState(null);
  const worldImportRef = useRef(null);

  const loadWorlds = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await getWorlds();
      const casts = await Promise.all(
        data.map((world) => getCharactersByWorld(world.id).catch(() => []))
      );
      setWorlds(data.map((world, index) => ({
        ...world,
        character_count: casts[index].length,
        cast: casts[index].slice(0, CAST_PREVIEW).map(({ id, name, avatar_path }) => ({
          id,
          name,
          avatar_path,
        })),
      })));
    } catch (err) {
      setWorlds([]);
      setLoadError(err.message || '读取世界列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void loadWorlds();
    }, 0);
    return () => clearTimeout(timeoutId);
  }, [loadWorlds, reloadKey]);

  useWorldUpdateReload(setReloadKey);

  const handleDelete = useCallback(async () => {
    try {
      await deleteWorld(deletingWorld.id);
    } catch (err) {
      log.error('worlds.delete_failed', err, { toast: err.message || '删除世界失败' });
      return;
    }
    setDeletingWorld(null);
    await loadWorlds();
  }, [deletingWorld, loadWorlds]);

  const handleExportWorld = useCallback(async (world, event) => {
    event.stopPropagation();
    setExportingWorldId(world.id);
    try {
      const safeName = world.name.replace(/[^\w一-龥]/g, '_');
      await downloadWorldCard(world.id, `${safeName}.weworld.json`);
    } catch (err) {
      log.error('world.export_failed', err, { toast: `导出失败：${err.message}` });
    } finally {
      setExportingWorldId(null);
    }
  }, []);

  const handleReorderEnd = useCallback(async (finalItems) => {
    setWorlds(finalItems);
    try {
      await reorderWorlds(finalItems.map((world, index) => ({ id: world.id, sort_order: index })));
    } catch (err) {
      log.error('world.sort.save_failed', err, { toast: `排序保存失败：${err.message}` });
      await loadWorlds();
    }
  }, [loadWorlds]);

  const handleImportWorldFile = useCallback(async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportingWorld(true);
    try {
      const data = await readJsonFile(file);
      const created = await importWorld(data);
      // 旧世界卡可能没有主色；补算一次，让导入的封面也能提供背景光源。
      if (created?.cover_path && !created.accent_color && created.accent_source !== 'manual') {
        try {
          const accentColor = await extractAccentColorFromImageSrc(getAvatarUrl(created.cover_path));
          await updateWorld(created.id, { accent_color: accentColor, accent_source: 'auto' });
        } catch (err) {
          log.error('world.import.accent_backfill_failed', err);
        }
      }
      await loadWorlds();
    } catch (err) {
      log.error('world.import_failed', err, { toast: `导入失败：${err.message}` });
    } finally {
      setImportingWorld(false);
      event.target.value = '';
    }
  }, [loadWorlds]);

  return {
    worlds,
    loading,
    loadError,
    deletingWorld,
    setDeletingWorld,
    exportingWorldId,
    importingWorld,
    reloadKey,
    actionsOpenId,
    setActionsOpenId,
    worldImportRef,
    loadWorlds,
    handleDelete,
    handleExportWorld,
    handleReorderEnd,
    handleImportWorldFile,
  };
}
