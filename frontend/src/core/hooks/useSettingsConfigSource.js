import { useCallback, useEffect, useState } from 'react';
import { getConfig, updateConfig } from '../api/config.js';
import { log } from '../utils/logger.js';

export function useSettingsConfigWriter(suppressNextReloadRef) {
  return useCallback(async (patch, { announceSaved = true, reload = false } = {}) => {
    suppressNextReloadRef.current = !reload;
    try {
      const updated = await updateConfig(patch);
      if (announceSaved) log.info('settings.saved', null, { toast: '设置已保存' });
      return updated;
    } catch (err) {
      suppressNextReloadRef.current = false;
      log.error('settings.save_failed', err, { toast: `设置保存失败，本次修改未生效：${err.message || '未知错误'}` });
      throw err;
    }
  }, [suppressNextReloadRef]);
}

export function useSettingsConfigLoader(suppressNextReloadRef, onConfigLoaded) {
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    getConfig().then((loadedConfig) => {
      onConfigLoaded(loadedConfig);
      setLoading(false);
    });
  }, [reloadKey, onConfigLoaded]);

  useEffect(() => {
    const handleConfigUpdated = () => {
      if (suppressNextReloadRef.current) {
        suppressNextReloadRef.current = false;
        return;
      }
      setReloadKey((key) => key + 1);
    };
    window.addEventListener('we:global-config-updated', handleConfigUpdated);
    return () => window.removeEventListener('we:global-config-updated', handleConfigUpdated);
  }, [suppressNextReloadRef]);

  return loading;
}
