import { useCallback, useEffect, useRef, useState } from 'react';
import { useCreateDraftIdentity } from '../../core/hooks/useCreateDraftIdentity.js';
import { keepEdited, useFormBaseline } from '../../core/hooks/useFormBaseline.js';
import { log } from '../../core/utils/logger.js';

function readDraft(key) {
  try {
    return JSON.parse(sessionStorage.getItem(key) || '{}');
  } catch {
    return {};
  }
}

/**
 * 角色卡 / 玩家卡编辑页共用的表单状态：名称与简介之外的文本字段（prompts）、创建草稿的恢复与自动保存、
 * 是否有未保存修改、加载与重试、头像上传、状态初始值页的数据，以及「卡片已更新」事件触发的重新加载。
 * 取数与保存各页自己做：load 成功后调 applyLoaded，失败调 failLoad。
 */
export function useCardEditForm({ isCreate, draftKey, promptKeys, updatedEvent }) {
  const { draft, name, setName, description, setDescription } = useCreateDraftIdentity(isCreate, () => readDraft(draftKey));
  const [prompts, setPrompts] = useState(() => Object.fromEntries(promptKeys.map((k) => [k, draft[k] ?? ''])));
  const setPrompt = useCallback((key, value) => setPrompts((p) => ({ ...p, [key]: value })), []);
  const values = { name, description, ...prompts };

  const { dirty, baselineRef, setBaseline } = useFormBaseline(values);
  // 保存成功：sent 是提交时的表单值，stored 是写进服务端的值（名称、简介去掉了首尾空白）；
  // 提交后又改过的字段保留输入，没改过的换成 stored
  const markSaved = (sent, stored) => {
    setName(keepEdited(sent, 'name', stored));
    setDescription(keepEdited(sent, 'description', stored));
    setBaseline(stored);
  };

  const draftJson = JSON.stringify(values);
  useEffect(() => {
    if (isCreate) sessionStorage.setItem(draftKey, draftJson);
  }, [isCreate, draftKey, draftJson]);
  const clearDraft = () => sessionStorage.removeItem(draftKey);

  const [loading, setLoading] = useState(!isCreate);
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  function retryLoad() {
    setLoadError('');
    setLoading(true);
    reload();
  }
  useEffect(() => {
    window.addEventListener(updatedEvent, reload);
    return () => window.removeEventListener(updatedEvent, reload);
  }, [updatedEvent, reload]);

  const [avatarPath, setAvatarPath] = useState(null);
  const [stateFields, setStateFields] = useState([]);
  const [profileRows, setProfileRows] = useState([]);

  // 重新取数（卡片更新事件、上传头像后）不冲掉未保存的输入：只替换基准之后没改过的字段
  const applyLoaded = useCallback((loaded, { avatarPath: path, stateFields: fields, profileRows: rows }) => {
    const base = baselineRef.current;
    setName(keepEdited(base, 'name', loaded));
    setDescription(keepEdited(base, 'description', loaded));
    setPrompts((p) => Object.fromEntries(Object.keys(p).map((k) => [k, keepEdited(base, k, loaded)(p[k])])));
    setBaseline(loaded);
    setAvatarPath(path ?? null);
    setStateFields(fields);
    setProfileRows(rows);
    setLoading(false);
  }, [baselineRef, setName, setDescription, setBaseline, setPrompts, setAvatarPath, setStateFields, setProfileRows, setLoading]);
  const failLoad = useCallback((message) => setLoadError(message), []);

  const fileInputRef = useRef(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  // upload(file) 返回带 avatar_path 的结果；logKey 用于失败日志
  const uploadAvatar = (upload, logKey) => async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    try {
      const result = await upload(file);
      setAvatarPath(result.avatar_path);
      window.dispatchEvent(new Event(updatedEvent));
    } catch (err) {
      log.error(logKey, err, { toast: `头像上传失败：${err.message}` });
    } finally {
      setAvatarUploading(false);
      e.target.value = '';
    }
  };

  return {
    name, setName, description, setDescription, prompts, setPrompt, values, dirty, markSaved, clearDraft,
    loading, setLoading, loadError, retryLoad, reloadKey, reload, applyLoaded, failLoad,
    avatarPath, avatarUploading, fileInputRef, uploadAvatar,
    stateFields, profileRows,
  };
}
