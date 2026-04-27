import { useEffect, useRef, useState } from 'react';
import { fetchSessionStateValues } from '../api/session-state-values.js';
import { fetchDailyEntries } from '../api/daily-entries.js';

const EMPTY_STATE = { world: [], persona: [], character: [] };

export function useSessionState(sessionId, stateTick = 0, diaryTick = stateTick) {
  const [stateData, setStateData] = useState(null);
  const [diaryEntries, setDiaryEntries] = useState(null);
  const [stateJustChanged, setStateJustChanged] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const latestTicksRef = useRef({ stateTick, diaryTick });
  const stateTickRef = useRef(stateTick);
  const diaryTickRef = useRef(diaryTick);
  const changedTimerRef = useRef(null);
  const updatingStartRef = useRef(null);
  const stateDataRef = useRef(stateData);
  const diaryEntriesRef = useRef(diaryEntries);

  useEffect(() => {
    latestTicksRef.current = { stateTick, diaryTick };
  }, [stateTick, diaryTick]);

  useEffect(() => {
    stateDataRef.current = stateData;
  }, [stateData]);

  useEffect(() => {
    diaryEntriesRef.current = diaryEntries;
  }, [diaryEntries]);

  useEffect(() => {
    let cancelled = false;

    if (!sessionId) {
      clearTimeout(changedTimerRef.current);
      stateTickRef.current = latestTicksRef.current.stateTick;
      diaryTickRef.current = latestTicksRef.current.diaryTick;
      Promise.resolve().then(() => {
        if (cancelled) return;
        setStateData(EMPTY_STATE);
        setDiaryEntries([]);
      });
      return () => {
        cancelled = true;
      };
    }

    clearTimeout(changedTimerRef.current);
    stateTickRef.current = latestTicksRef.current.stateTick;
    diaryTickRef.current = latestTicksRef.current.diaryTick;
    Promise.resolve().then(() => {
      if (cancelled) return;
      setStateData(null);
      setDiaryEntries(null);
    });

    fetchSessionStateValues(sessionId)
      .then((data) => {
        if (!cancelled) setStateData(data);
      })
      .catch(() => {
        if (!cancelled) setStateData(EMPTY_STATE);
      });
    fetchDailyEntries(sessionId)
      .then((entries) => {
        if (!cancelled) setDiaryEntries(entries);
      })
      .catch(() => {
        if (!cancelled) setDiaryEntries([]);
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;

    const shouldRefreshState = stateTick !== stateTickRef.current;
    const shouldRefreshDiary = diaryTick !== diaryTickRef.current;
    if (!shouldRefreshState && !shouldRefreshDiary) return;

    stateTickRef.current = stateTick;
    diaryTickRef.current = diaryTick;

    // diary-only 更新（stateTick 未变）静默刷新，不显示"整理中"overlay
    const showOverlay = shouldRefreshState;
    let cancelled = false;

    if (showOverlay) {
      updatingStartRef.current = Date.now();
      setIsUpdating(true);
    }

    (async () => {
      try {
        const [nextState, nextDiary] = await Promise.all([
          shouldRefreshState ? fetchSessionStateValues(sessionId) : Promise.resolve(stateDataRef.current),
          shouldRefreshDiary ? fetchDailyEntries(sessionId) : Promise.resolve(diaryEntriesRef.current),
        ]);
        if (cancelled) return;

        if (showOverlay) {
          const elapsed = Date.now() - (updatingStartRef.current ?? 0);
          const remaining = Math.max(0, 1500 - elapsed);
          await new Promise((resolve) => setTimeout(resolve, remaining));
          if (cancelled) return;
        }

        if (shouldRefreshState) setStateData(nextState ?? EMPTY_STATE);
        if (shouldRefreshDiary) setDiaryEntries(nextDiary ?? []);

        if (showOverlay) {
          setIsUpdating(false);
          clearTimeout(changedTimerRef.current);
          setStateJustChanged(true);
          changedTimerRef.current = setTimeout(() => setStateJustChanged(false), 1500);
        }
      } catch {
        if (cancelled) return;
        if (showOverlay) setIsUpdating(false);
        if (shouldRefreshState) setStateData((prev) => prev ?? EMPTY_STATE);
        if (shouldRefreshDiary) setDiaryEntries((prev) => prev ?? []);
      }
    })();

    return () => {
      cancelled = true;
      if (showOverlay) setIsUpdating(false);
    };
  }, [sessionId, stateTick, diaryTick]);

  useEffect(() => () => clearTimeout(changedTimerRef.current), []);

  return { stateData, setStateData, diaryEntries, setDiaryEntries, stateJustChanged, isUpdating };
}
