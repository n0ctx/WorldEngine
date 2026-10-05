import { useEffect, useState } from 'react';
import { useAppModeStore } from '../../../core/state/appMode.js';
import { SETTINGS_MODE } from '../../../core/constants/settings';
import { refreshCustomCss } from '../../../core/api/custom-css-snippets.js';
import { getPersona, getPersonaById } from '../../../core/api/personas.js';
import useStore from '../../../core/state/index.js';
import useCurrentStoryStore from '../../../core/state/currentStory.js';
import { listWritingSessions, createWritingSession } from '../../../core/api/writing-sessions.js';
import { getSession } from '../../../core/api/sessions.js';
import { writingSessionListBridge } from '../../../core/utils/session-list-bridge.js';

export function useWritingSpaceMode() {
  const setAppMode = useAppModeStore((s) => s.setAppMode);

  useEffect(() => {
    setAppMode(SETTINGS_MODE.WRITING);
    refreshCustomCss(SETTINGS_MODE.WRITING);
    return () => {
      setAppMode(SETTINGS_MODE.CHAT);
      refreshCustomCss(SETTINGS_MODE.CHAT);
    };
  }, [setAppMode]);
}

export function useWritingSpaceLifecycle({ worldId, stream, log }) {
  const [persona, setPersona] = useState(null);
  // 首帧就处于初始化：否则正文会先以「没有会话」挂上并报定位完成，台前提前展开露面
  const [isInitializing, setIsInitializing] = useState(Boolean(worldId));
  const [initError, setInitError] = useState(null);
  const [initRetryToken, setInitRetryToken] = useState(0);
  const currentWritingSessionId = useStore((s) => s.currentWritingSessionId);
  const setCurrentWritingSessionId = useStore((s) => s.setCurrentWritingSessionId);
  const setStoryTitle = useCurrentStoryStore((s) => s.setStoryTitle);
  const { currentSession, clearOptionsState, enterSession, handleSessionCreate } = stream;

  useEffect(() => {
    if (!worldId) return;
    const timeoutId = setTimeout(() => {
      clearOptionsState();
      // writing session 自带 persona_id；session 加载完成后再由专门 effect 同步 persona 头像
      // 此处先按世界 active persona 兜底渲染，避免顶栏闪空
      getPersona(worldId).then(setPersona).catch(() => {});
    }, 0);
    return () => clearTimeout(timeoutId);
    // clearOptionsState 为流 hook 内的命令式重置入口，跟随 worldId 触发即可，不需要进 deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldId]);

  // session 切换时，按 session.persona_id 重新加载 persona 头像/名字
  useEffect(() => {
    const personaId = currentSession?.persona_id;
    if (!personaId) return;
    getPersonaById(personaId).then(setPersona).catch(() => {});
  }, [currentSession?.persona_id]);

  // 当前故事线标题同步给 TopBar 面包屑；离开页面清空，避免残留
  useEffect(() => {
    setStoryTitle(currentSession?.title || null);
  }, [currentSession?.title, setStoryTitle]);
  useEffect(() => () => setStoryTitle(null), [setStoryTitle]);

  // 初始化：加载或自动创建第一个会话
  // 若 currentWritingSessionId 给了目标 session（来自 TopBar「会话」入口），优先选它；
  // 命中失败/无 hint 时落到 sessions[0]（列表已按 updated_at DESC 排序，即最新一条）。
  useEffect(() => {
    if (!worldId) return;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      setIsInitializing(true);
      setInitError(null);
    });
    listWritingSessions(worldId).then((sessions) => {
      if (cancelled) return;
      const hintId = useStore.getState().currentWritingSessionId;
      if (sessions.length === 0) {
        createWritingSession(worldId).then((s) => {
          if (cancelled) return;
          writingSessionListBridge.addSession?.(s);
          enterSession(s);
          setIsInitializing(false);
        }).catch((err) => {
          if (cancelled) return;
          log.error('writing.session.create_failed', err, { toast: err.message || '创建写作故事线失败' });
          setInitError('创建写作故事线失败，请重试');
          setIsInitializing(false);
        });
        return;
      }
      const target = (hintId && sessions.find((s) => s.id === hintId)) || sessions[0];
      enterSession(target);
      setIsInitializing(false);
    }).catch((err) => {
      if (cancelled) return;
      log.error('writing.session.list_failed', err, { toast: err.message || '加载写作故事线失败' });
      setInitError('加载写作故事线失败，请重试');
      setIsInitializing(false);
    });
    return () => {
      cancelled = true;
    };
    // enterSession is intentionally kept as the page-level imperative transition used by stream callbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldId, initRetryToken]);

  // 已在写作页时 TopBar 再次下发「会话」hint：切到目标 session 后清空 hint。
  // 与 init 效应配合：若 hint 在 mount 时已被 init 消费命中，进入此效应后 ids 相同直接清 hint；
  // 不一致（用户在另一会话编辑期间，目标 session 的 updated_at 已变成更新一条）则按 id 拉取并切换。
  useEffect(() => {
    if (!currentWritingSessionId) return;
    if (!currentSession) return;
    if (currentSession.id === currentWritingSessionId) {
      setCurrentWritingSessionId(null);
      return;
    }
    let cancelled = false;
    getSession(currentWritingSessionId).then((s) => {
      if (cancelled) return;
      if (s && s.mode === 'writing') enterSession(s);
    }).catch(() => {}).finally(() => {
      if (!cancelled) setCurrentWritingSessionId(null);
    });
    return () => { cancelled = true; };
    // enterSession 是 page 内命令式入口，跟 store setter 一样不需要进 deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWritingSessionId, currentSession]);

  // 新建写作会话：创建后通过 bridge 合并进左侧时间线，再进入该会话
  async function handleCreateWritingSession() {
    try {
      const session = await createWritingSession(worldId);
      writingSessionListBridge.addSession?.(session);
      handleSessionCreate(session);
    } catch (e) {
      log.error('session.create_failed', e, { toast: e.message || '创建故事线失败' });
    }
  }

  // 内联删除的正是当前打开的写作会话：写作页不允许「无会话」态，落到剩余会话里最新一条，
  // 一条都不剩就照 init 逻辑自动新建一条——与 useWritingStream 原 handleSessionDelete 的不变量一致。
  async function handleActiveWritingSessionDeleted() {
    try {
      const sessions = await listWritingSessions(worldId);
      if (sessions.length > 0) {
        enterSession(sessions[0]);
        return;
      }
      const session = await createWritingSession(worldId);
      writingSessionListBridge.addSession?.(session);
      enterSession(session);
    } catch (err) {
      log.error('writing.session.delete_recover_failed', err, { toast: '恢复写作故事线失败' });
    }
  }

  return {
    persona,
    isInitializing,
    initError,
    retryInitialization: () => setInitRetryToken((token) => token + 1),
    handleCreateWritingSession,
    handleActiveWritingSessionDeleted,
  };
}
