import { useEffect, useState } from 'react';
import useStore from '../../store/index.js';
import { getWorldStateValues, resetWorldStateValues } from '../../api/worldStateValues.js';
import { getCharacterStateValues, resetCharacterStateValues } from '../../api/characterStateValues.js';
import { getWorldTimeline } from '../../api/worldTimeline.js';
import { getPersonaStateValues, resetPersonaStateValues } from '../../api/personaStateValues.js';

function parseValue(valueJson, type) {
  if (valueJson == null) return null;
  try {
    const v = JSON.parse(valueJson);
    if (type === 'boolean') return v ? '是' : '否';
    if (type === 'list') {
      if (!Array.isArray(v) || v.length === 0) return null;
      return v.join('、');
    }
    return String(v);
  } catch {
    return String(valueJson);
  }
}

function Section({ title, children, defaultOpen = true, onReset, resetting = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border last:border-b-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-sand transition-colors"
      >
        <span className="font-serif text-xs font-semibold text-text uppercase tracking-wide">{title}</span>
        <div className="flex items-center gap-2">
          {onReset && (
            <span
              role="button"
              onClick={(e) => { e.stopPropagation(); if (!resetting) onReset(); }}
              className="text-xs opacity-40 hover:opacity-100 transition-opacity px-1.5 py-0.5 rounded hover:bg-accent/10 hover:text-accent cursor-pointer select-none"
              title="清空临时状态并回退默认值"
            >
              {resetting ? '重置中…' : '重置'}
            </span>
          )}
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="opacity-40 transition-transform"
            style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}
          >
            <polyline points="2,4 6,8 10,4" />
          </svg>
        </div>
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}

function LoadingRow() {
  return <p className="text-xs opacity-30 py-1">加载中…</p>;
}

function ErrorRow({ msg }) {
  return <p className="text-xs text-red-400 py-1">{msg}</p>;
}

function StateRows({ rows, pinnedName }) {
  const hasName = pinnedName != null && pinnedName !== '';
  const hasRows = rows && rows.length > 0;
  if (!hasName && !hasRows) {
    return <p className="text-xs opacity-30 py-1">暂无数据</p>;
  }
  return (
    <dl className="space-y-1.5 mt-1">
      {hasName && (
        <div className="we-state-field-row flex gap-2 items-baseline">
          <dt className="text-xs opacity-50 shrink-0 min-w-[4rem]">姓名</dt>
          <dd className="text-xs text-text-secondary font-medium break-all">{pinnedName}</dd>
        </div>
      )}
      {rows?.map((row) => {
        const display = parseValue(row.effective_value_json, row.type);
        return (
          <div key={row.field_key} className="we-state-field-row flex gap-2 items-baseline">
            <dt className="text-xs opacity-50 shrink-0 min-w-[4rem]">{row.label}</dt>
            <dd className="text-xs text-text-secondary break-all">
              {display != null ? display : <span className="opacity-30">—</span>}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function TimelineRows({ rows }) {
  if (!rows || rows.length === 0) {
    return <p className="text-xs opacity-30 py-1">暂无记录</p>;
  }
  return (
    <ul className="space-y-1.5 mt-1">
      {rows.map((row) => (
        <li key={row.id} className="text-xs leading-relaxed">
          {row.is_compressed === 1 ? (
            <span className="text-text-secondary opacity-40 italic">
              「早期历史」{row.content}
            </span>
          ) : (
            <span className="text-text-secondary">{row.content}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function MemoryPanel({ worldId, characterId, character, persona }) {
  const tick = useStore((s) => s.memoryRefreshTick);

  const [personaState, setPersonaState] = useState(null);
  const [personaStateLoading, setPersonaStateLoading] = useState(false);
  const [personaStateError, setPersonaStateError] = useState(null);

  const [worldState, setWorldState] = useState(null);
  const [worldStateLoading, setWorldStateLoading] = useState(false);
  const [worldStateError, setWorldStateError] = useState(null);

  const [charState, setCharState] = useState(null);
  const [charStateLoading, setCharStateLoading] = useState(false);
  const [charStateError, setCharStateError] = useState(null);

  const [timeline, setTimeline] = useState(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState(null);

  const [isPolling, setIsPolling] = useState(false);

  const [worldResetting, setWorldResetting] = useState(false);
  const [personaResetting, setPersonaResetting] = useState(false);
  const [charResetting, setCharResetting] = useState(false);

  async function handleResetWorldState() {
    if (!worldId || worldResetting) return;
    setWorldResetting(true);
    try {
      const rows = await resetWorldStateValues(worldId);
      setWorldState(rows);
    } catch (e) {
      console.error('重置世界状态失败', e);
    } finally {
      setWorldResetting(false);
    }
  }

  async function handleResetPersonaState() {
    if (!worldId || personaResetting) return;
    setPersonaResetting(true);
    try {
      const rows = await resetPersonaStateValues(worldId);
      setPersonaState(rows);
    } catch (e) {
      console.error('重置玩家状态失败', e);
    } finally {
      setPersonaResetting(false);
    }
  }

  async function handleResetCharState() {
    if (!characterId || charResetting) return;
    setCharResetting(true);
    try {
      const rows = await resetCharacterStateValues(characterId);
      setCharState(rows);
    } catch (e) {
      console.error('重置角色状态失败', e);
    } finally {
      setCharResetting(false);
    }
  }

  useEffect(() => {
    if (!worldId) return;
    setPersonaStateLoading(true);
    setPersonaStateError(null);
    getPersonaStateValues(worldId)
      .then(setPersonaState)
      .catch((e) => setPersonaStateError(e.message))
      .finally(() => setPersonaStateLoading(false));
  }, [worldId]);

  useEffect(() => {
    if (!worldId) return;
    setWorldStateLoading(true);
    setWorldStateError(null);
    getWorldStateValues(worldId)
      .then(setWorldState)
      .catch((e) => setWorldStateError(e.message))
      .finally(() => setWorldStateLoading(false));
  }, [worldId]);

  useEffect(() => {
    if (!characterId) return;
    setCharStateLoading(true);
    setCharStateError(null);
    getCharacterStateValues(characterId)
      .then(setCharState)
      .catch((e) => setCharStateError(e.message))
      .finally(() => setCharStateLoading(false));
  }, [characterId]);

  useEffect(() => {
    if (!worldId) return;
    setTimelineLoading(true);
    setTimelineError(null);
    getWorldTimeline(worldId, 50)
      .then(setTimeline)
      .catch((e) => setTimelineError(e.message))
      .finally(() => setTimelineLoading(false));
  }, [worldId]);

  // 轮询：AI 回复结束后感知异步状态更新
  useEffect(() => {
    if (tick === 0) return;

    setIsPolling(true);
    const snapshot = JSON.stringify([personaState, worldState, charState, timeline]);

    let intervalId;
    let timeoutId;

    intervalId = setInterval(async () => {
      try {
        const [newPersona, newWorld, newChar, newTimeline] = await Promise.all([
          worldId ? getPersonaStateValues(worldId) : Promise.resolve(null),
          worldId ? getWorldStateValues(worldId) : Promise.resolve(null),
          characterId ? getCharacterStateValues(characterId) : Promise.resolve(null),
          worldId ? getWorldTimeline(worldId, 50) : Promise.resolve(null),
        ]);
        const current = JSON.stringify([newPersona, newWorld, newChar, newTimeline]);
        if (current !== snapshot) {
          if (newPersona !== null) setPersonaState(newPersona);
          if (newWorld !== null) setWorldState(newWorld);
          if (newChar !== null) setCharState(newChar);
          if (newTimeline !== null) setTimeline(newTimeline);
          setIsPolling(false);
          clearInterval(intervalId);
          clearTimeout(timeoutId);
        }
      } catch {
        setIsPolling(false);
        clearInterval(intervalId);
        clearTimeout(timeoutId);
      }
    }, 3000);

    timeoutId = setTimeout(() => {
      setIsPolling(false);
      clearInterval(intervalId);
    }, 20000);

    return () => {
      clearInterval(intervalId);
      clearTimeout(timeoutId);
    };
  }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="we-memory-panel flex flex-col h-full">
      {/* 标题头 */}
      <div className="px-4 pt-4 pb-3 border-b border-border shrink-0 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text">记忆面板</h2>
        {isPolling && (
          <div className="flex items-center gap-1.5">
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ backgroundColor: 'var(--we-accent)' }}
            />
            <span className="text-xs text-text-secondary">更新中…</span>
          </div>
        )}
      </div>
      {/* 可滚动内容 */}
      <div className="flex-1 overflow-y-auto">
        <Section title="世界状态" onReset={handleResetWorldState} resetting={worldResetting}>
          {worldStateLoading ? <LoadingRow /> : worldStateError ? <ErrorRow msg={worldStateError} /> : <StateRows rows={worldState} />}
        </Section>
        <Section title="玩家状态" onReset={handleResetPersonaState} resetting={personaResetting}>
          {personaStateLoading ? <LoadingRow /> : personaStateError ? <ErrorRow msg={personaStateError} /> : <StateRows rows={personaState} pinnedName={persona?.name} />}
        </Section>
        <Section title="角色状态" onReset={handleResetCharState} resetting={charResetting}>
          {charStateLoading ? <LoadingRow /> : charStateError ? <ErrorRow msg={charStateError} /> : <StateRows rows={charState} pinnedName={character?.name} />}
        </Section>
        <Section title="世界时间线">
          {timelineLoading ? <LoadingRow /> : timelineError ? <ErrorRow msg={timelineError} /> : <TimelineRows rows={timeline} />}
        </Section>
      </div>
    </div>
  );
}
