import { useEffect, useState } from 'react';
import { getWorldStateValues } from '../../api/worldStateValues.js';
import { getCharacterStateValues } from '../../api/characterStateValues.js';
import { getWorldTimeline } from '../../api/worldTimeline.js';
import { getPersonaStateValues } from '../../api/personaStateValues.js';
import ActiveCharactersPicker from './ActiveCharactersPicker.jsx';

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

function Section({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border last:border-b-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-sand transition-colors"
      >
        <span className="font-serif text-xs font-semibold text-text uppercase tracking-wide">{title}</span>
        <svg
          width="12" height="12" viewBox="0 0 12 12" fill="none"
          stroke="currentColor" strokeWidth="2"
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
            <span className="text-text-secondary opacity-40 italic">「早期历史」{row.content}</span>
          ) : (
            <span className="text-text-secondary">{row.content}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function CharacterStateSection({ character }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!character?.id) return;
    setLoading(true);
    getCharacterStateValues(character.id)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [character?.id]);

  return (
    <Section title={`${character.name} 状态`} defaultOpen={false}>
      {loading ? <LoadingRow /> : error ? <ErrorRow msg={error} /> : <StateRows rows={data} />}
    </Section>
  );
}

export default function MultiCharacterMemoryPanel({ worldId, sessionId, activeCharacters = [] }) {
  const [personaState, setPersonaState] = useState(null);
  const [personaLoading, setPersonaLoading] = useState(false);
  const [personaError, setPersonaError] = useState(null);

  const [worldState, setWorldState] = useState(null);
  const [worldLoading, setWorldLoading] = useState(false);
  const [worldError, setWorldError] = useState(null);

  const [timeline, setTimeline] = useState(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState(null);

  useEffect(() => {
    if (!worldId) return;
    setPersonaLoading(true);
    getPersonaStateValues(worldId)
      .then(setPersonaState)
      .catch((e) => setPersonaError(e.message))
      .finally(() => setPersonaLoading(false));
  }, [worldId]);

  useEffect(() => {
    if (!worldId) return;
    setWorldLoading(true);
    getWorldStateValues(worldId)
      .then(setWorldState)
      .catch((e) => setWorldError(e.message))
      .finally(() => setWorldLoading(false));
  }, [worldId]);

  useEffect(() => {
    if (!worldId) return;
    setTimelineLoading(true);
    getWorldTimeline(worldId, 50)
      .then(setTimeline)
      .catch((e) => setTimelineError(e.message))
      .finally(() => setTimelineLoading(false));
  }, [worldId]);

  return (
    <div className="we-memory-panel flex flex-col h-full overflow-y-auto">
      {/* 激活角色选择器 */}
      {sessionId && (
        <ActiveCharactersPicker worldId={worldId} sessionId={sessionId} />
      )}

      {/* 世界状态 */}
      <Section title="世界状态">
        {worldLoading ? <LoadingRow /> : worldError ? <ErrorRow msg={worldError} /> : <StateRows rows={worldState} />}
      </Section>

      {/* 玩家状态 */}
      <Section title="玩家状态">
        {personaLoading ? <LoadingRow /> : personaError ? <ErrorRow msg={personaError} /> : <StateRows rows={personaState} />}
      </Section>

      {/* 每个激活角色的状态 */}
      {activeCharacters.map((character) => (
        <CharacterStateSection key={character.id} character={character} />
      ))}

      {/* 世界时间线 */}
      <Section title="世界时间线" defaultOpen={false}>
        {timelineLoading ? <LoadingRow /> : timelineError ? <ErrorRow msg={timelineError} /> : <TimelineRows rows={timeline} />}
      </Section>
    </div>
  );
}
