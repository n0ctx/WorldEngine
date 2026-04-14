import { useEffect, useState } from 'react';
import { getWorldStateValues } from '../../api/worldStateValues.js';
import { getCharacterStateValues } from '../../api/characterStateValues.js';
import { getWorldTimeline } from '../../api/worldTimeline.js';
import { getPersonaStateValues } from '../../api/personaStateValues.js';

function parseValue(valueJson, type) {
  if (valueJson == null) return null;
  try {
    const v = JSON.parse(valueJson);
    if (type === 'boolean') return v ? '是' : '否';
    return String(v);
  } catch {
    return String(valueJson);
  }
}

function Section({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-[var(--border)] last:border-b-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-[var(--border)] transition-colors"
      >
        <span className="text-xs font-semibold text-[var(--text-h)] uppercase tracking-wide">{title}</span>
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

function StateRows({ rows }) {
  if (!rows || rows.length === 0) {
    return <p className="text-xs opacity-30 py-1">暂无数据</p>;
  }
  return (
    <dl className="space-y-1.5 mt-1">
      {rows.map((row) => {
        const display = parseValue(row.value_json, row.type);
        return (
          <div key={row.field_key} className="flex gap-2 items-baseline">
            <dt className="text-xs opacity-50 shrink-0 min-w-[4rem]">{row.label}</dt>
            <dd className="text-xs text-[var(--text)] break-all">
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
            <span className="text-[var(--text)] opacity-40 italic">
              「早期历史」{row.content}
            </span>
          ) : (
            <span className="text-[var(--text)]">{row.content}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function MemoryPanel({ worldId, characterId }) {
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

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <Section title="世界状态">
        {worldStateLoading ? <LoadingRow /> : worldStateError ? <ErrorRow msg={worldStateError} /> : <StateRows rows={worldState} />}
      </Section>
      <Section title="玩家状态">
        {personaStateLoading ? <LoadingRow /> : personaStateError ? <ErrorRow msg={personaStateError} /> : <StateRows rows={personaState} />}
      </Section>
      <Section title="角色状态">
        {charStateLoading ? <LoadingRow /> : charStateError ? <ErrorRow msg={charStateError} /> : <StateRows rows={charState} />}
      </Section>
      <Section title="世界时间线">
        {timelineLoading ? <LoadingRow /> : timelineError ? <ErrorRow msg={timelineError} /> : <TimelineRows rows={timeline} />}
      </Section>
    </div>
  );
}
