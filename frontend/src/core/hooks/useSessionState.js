import { useEffect, useRef, useState } from 'react';
import { fetchSessionStateValues } from '../api/session-state-values.js';
import { fetchDailyEntries } from '../api/daily-entries.js';

const EMPTY_STATE = { world: [], persona: [], character: [] };

export function useSessionState(sessionId, stateTick = 0, diaryTick = stateTick, stateQueuedTick = stateTick, stateFailedTick = 0) {
  const [stateData, setStateData] = useState(null);
  const [diaryEntries, setDiaryEntries] = useState(null);
  const [stateError, setStateError] = useState(null);
  const [diaryError, setDiaryError] = useState(null);
  const [stateJustChanged, setStateJustChanged] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const latestTicksRef = useRef({ stateTick, diaryTick, stateQueuedTick });
  const stateTickRef = useRef(stateTick);
  const diaryTickRef = useRef(diaryTick);
  const stateQueuedTickRef = useRef(stateQueuedTick);
  const stateFailedTickRef = useRef(stateFailedTick);
  const changedTimerRef = useRef(null);
  const updatingStartRef = useRef(null);
  const stateDataRef = useRef(stateData);
  const diaryEntriesRef = useRef(diaryEntries);

  useEffect(() => {
    latestTicksRef.current = { stateTick, diaryTick, stateQueuedTick };
  }, [stateTick, diaryTick, stateQueuedTick]);

  useEffect(() => {
    stateDataRef.current = stateData;
  }, [stateData]);

  useEffect(() => {
    diaryEntriesRef.current = diaryEntries;
  }, [diaryEntries]);

  // sessionId 变化：重置所有 tick ref 并重新加载初始数据
  useEffect(() => {
    let cancelled = false;

    if (!sessionId) {
      clearTimeout(changedTimerRef.current);
      stateTickRef.current = latestTicksRef.current.stateTick;
      diaryTickRef.current = latestTicksRef.current.diaryTick;
      stateQueuedTickRef.current = latestTicksRef.current.stateQueuedTick;
      Promise.resolve().then(() => {
        if (cancelled) return;
        setStateData(EMPTY_STATE);
        setDiaryEntries([]);
        setStateError(null);
        setDiaryError(null);
        setIsUpdating(false);
      });
      return () => {
        cancelled = true;
      };
    }

    clearTimeout(changedTimerRef.current);
    stateTickRef.current = latestTicksRef.current.stateTick;
    diaryTickRef.current = latestTicksRef.current.diaryTick;
    stateQueuedTickRef.current = latestTicksRef.current.stateQueuedTick;
    Promise.resolve().then(() => {
      if (cancelled) return;
      setStateData(null);
      setDiaryEntries(null);
      setStateError(null);
      setDiaryError(null);
      setIsUpdating(false);
    });

    fetchSessionStateValues(sessionId)
      .then((data) => {
        if (!cancelled) {
          setStateData(data);
          setStateError(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStateData(EMPTY_STATE);
          setStateError('状态加载失败');
        }
      });
    fetchDailyEntries(sessionId)
      .then((entries) => {
        if (!cancelled) {
          setDiaryEntries(entries);
          setDiaryError(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDiaryEntries([]);
          setDiaryError('日记加载失败');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId, reloadToken]);

  // Effect A：stateQueuedTick 变化 → 立即显示"整理中" overlay，记录开始时间
  useEffect(() => {
    if (!sessionId) return;
    if (stateQueuedTick === stateQueuedTickRef.current) return;
    stateQueuedTickRef.current = stateQueuedTick;
    updatingStartRef.current = Date.now();
    setIsUpdating(true);
  }, [sessionId, stateQueuedTick]);

  // Effect C：stateFailedTick 变化 → 仅清除 overlay，不走成功动画
  useEffect(() => {
    if (!sessionId) return;
    if (stateFailedTick === stateFailedTickRef.current) return;
    stateFailedTickRef.current = stateFailedTick;
    updatingStartRef.current = null;
    setIsUpdating(false);
  }, [sessionId, stateFailedTick]);

  // Effect B：stateTick / diaryTick 变化 → 拉取新数据并隐藏 overlay
  useEffect(() => {
    if (!sessionId) return;

    const shouldRefreshState = stateTick !== stateTickRef.current;
    const shouldRefreshDiary = diaryTick !== diaryTickRef.current;
    if (!shouldRefreshState && !shouldRefreshDiary) return;

    stateTickRef.current = stateTick;
    diaryTickRef.current = diaryTick;

    // diary-only 更新（stateTick 未变）静默刷新，不显示/隐藏"整理中"overlay
    const showOverlay = shouldRefreshState;
    let cancelled = false;

    (async () => {
      // 快照本轮 overlay 的"开始时间戳"，用于检测本轮 fetch 完成前是否有新一轮入队
      const capturedUpdatingStart = updatingStartRef.current;
      try {
        const [nextState, nextDiary] = await Promise.all([
          shouldRefreshState ? fetchSessionStateValues(sessionId) : Promise.resolve(stateDataRef.current),
          shouldRefreshDiary ? fetchDailyEntries(sessionId) : Promise.resolve(diaryEntriesRef.current),
        ]);
        if (cancelled) return;

        if (showOverlay) {
          // 保证 overlay 至少显示 1500ms（从 stateQueuedTick 触发时开始计）
          const elapsed = Date.now() - (capturedUpdatingStart ?? Date.now());
          const remaining = Math.max(0, 1500 - elapsed);
          await new Promise((resolve) => setTimeout(resolve, remaining));
          if (cancelled) return;
        }

        if (shouldRefreshState) {
          setStateData(nextState ?? EMPTY_STATE);
          setStateError(null);
        }
        if (shouldRefreshDiary) {
          setDiaryEntries(nextDiary ?? []);
          setDiaryError(null);
        }

        if (showOverlay) {
          // 仅当没有更新的一轮 stateQueuedTick 入队时才清除 overlay 和播放成功动画；
          // 若 updatingStartRef 已被新一轮 Effect A 改写，说明新一轮"整理中"正在进行，不能打断它。
          if (updatingStartRef.current === capturedUpdatingStart) {
            setIsUpdating(false);
            clearTimeout(changedTimerRef.current);
            setStateJustChanged(true);
            changedTimerRef.current = setTimeout(() => setStateJustChanged(false), 1500);
          }
        }
      } catch {
        if (cancelled) return;
        if (showOverlay && updatingStartRef.current === capturedUpdatingStart) setIsUpdating(false);
        if (shouldRefreshState) {
          setStateData((prev) => prev ?? EMPTY_STATE);
          setStateError('状态加载失败');
        }
        if (shouldRefreshDiary) {
          setDiaryEntries((prev) => prev ?? []);
          setDiaryError('日记加载失败');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionId, stateTick, diaryTick]);

  useEffect(() => () => clearTimeout(changedTimerRef.current), []);

  return {
    stateData,
    setStateData,
    diaryEntries,
    setDiaryEntries,
    stateError,
    diaryError,
    stateJustChanged,
    isUpdating,
    retryStateLoad: () => setReloadToken((token) => token + 1),
  };
}
