import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  listWorldEntries, deleteWorldEntry, reorderWorldEntries, updateWorldEntry,
} from '../../../core/api/prompt-entries';
import { log } from '../../../core/utils/logger.js';
import { FIELD_SCOPE_KEYS, SCOPES, TRIGGER_TYPES } from '../constants.js';

// 设定条目与状态字段的数据加载、增删改切换逻辑。UI 层的选中态/筛选态留在页面组件里。
export function useRulesData(worldId, { selectedEntryId, setSelectedEntryId }) {
  const [entries, setEntries] = useState([]);
  const [fieldsByScope, setFieldsByScope] = useState({ world: [], character: [], persona: [] });

  const refreshEntries = useCallback(() => {
    listWorldEntries(worldId).then(setEntries).catch(() => {});
  }, [worldId]);

  useEffect(() => { refreshEntries(); }, [refreshEntries]);
  useEffect(() => {
    window.addEventListener('we:world-updated', refreshEntries);
    return () => window.removeEventListener('we:world-updated', refreshEntries);
  }, [refreshEntries]);

  // 挂载时把三个作用域的字段都拉一遍，让左栏「状态字段」分组下三行计数随时可见，
  // 不必等用户先点进某个作用域才知道有多少字段。
  const loadFieldsFor = useCallback(async (scopeKey) => {
    try {
      const list = await SCOPES[scopeKey].listFn(worldId);
      setFieldsByScope((prev) => ({ ...prev, [scopeKey]: list }));
      return list;
    } catch (err) {
      log.error('rules.fields.load_failed', err, { toast: err.message || '加载字段失败' });
      return [];
    }
  }, [worldId]);

  useEffect(() => {
    FIELD_SCOPE_KEYS.forEach((k) => { loadFieldsFor(k); });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅需在 worldId 变化时重拉
  }, [worldId]);

  const triggerCounts = useMemo(() => Object.fromEntries(
    TRIGGER_TYPES.map(({ key }) => [key, entries.filter((entry) => entry.trigger_type === key).length]),
  ), [entries]);

  const handleDeleteEntry = useCallback(async (entry) => {
    try {
      await deleteWorldEntry(entry.id);
      if (selectedEntryId === entry.id) setSelectedEntryId(null);
      refreshEntries();
    } catch (e) {
      log.error('entry.delete_failed', e, { toast: '删除失败：' + (e?.message || '未知错误') });
    }
  }, [refreshEntries, selectedEntryId, setSelectedEntryId]);

  // 删除成功返回 true，交给页面决定是否清空当前选中字段
  const handleDeleteField = useCallback(async (scopeKey, field) => {
    try {
      await SCOPES[scopeKey].deleteFn(field.id);
    } catch (err) {
      log.error('state_field.delete_failed', err, { toast: err.message || '删除字段失败' });
      return false;
    }
    await loadFieldsFor(scopeKey);
    return true;
  }, [loadFieldsFor]);

  const handleToggleEntry = useCallback(async (entry) => {
    const newEnabled = entry.enabled === 0 ? 1 : 0;
    setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, enabled: newEnabled } : e)));
    try {
      await updateWorldEntry(entry.id, { enabled: newEnabled });
    } catch (e) {
      setEntries((prev) => prev.map((ee) => (ee.id === entry.id ? { ...ee, enabled: entry.enabled } : ee)));
      log.error('entry.toggle_failed', e, { toast: '切换失败：' + (e?.message || '未知错误') });
    }
  }, []);

  const handleReorderEntriesEnd = useCallback(async (finalItems) => {
    try {
      await reorderWorldEntries(worldId, finalItems.map((e) => e.id));
    } catch (e) {
      log.error('entry.reorder_failed', e, { toast: '排序保存失败：' + (e?.message || '未知错误') });
      refreshEntries();
    }
  }, [worldId, refreshEntries]);

  return {
    entries, setEntries, refreshEntries,
    fieldsByScope, loadFieldsFor,
    triggerCounts,
    handleDeleteEntry, handleToggleEntry, handleReorderEntriesEnd,
    handleDeleteField,
  };
}
