import { useState } from 'react';
import DatetimeSplitInput from './DatetimeSplitInput.jsx';
import { formatDatetimeChinese } from './state-value-format.js';
import { isImeComposing } from '../../core/utils/ime.js';
import { deleteStateFact, updateStateWorld } from '../../core/api/state-memory.js';
import { log } from '../../core/utils/logger.js';

/** 当前时间：DatetimeSplitInput 点击编辑，空值显示「未设定」 */
function WorldTimeField({ time, onCommit }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  if (!editing) {
    return (
      <div className="we-status-field">
        <span className="we-status-key">当前时间</span>
        <span
          className={`we-status-value we-status-editable${time ? '' : ' we-status-null'}`}
          onClick={() => { setDraft(time ?? ''); setEditing(true); }}
        >
          {time ? formatDatetimeChinese(time) : '未设定'}
        </span>
      </div>
    );
  }

  return (
    <div className="we-status-field we-status-field--editing">
      <span className="we-status-key">当前时间</span>
      <DatetimeSplitInput
        value={draft}
        autoFocus
        widthPreset="compact"
        onChange={setDraft}
        onBlur={() => {
          setEditing(false);
          if (draft && draft !== time) onCommit(draft);
        }}
        className="we-status-inline-input"
      />
    </div>
  );
}

/** 当前地点：可从地点实体里选，也可直接输入文字（datalist 提供建议，不限制输入） */
function WorldLocationField({ location, locationOptions, onCommit }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  if (!editing) {
    return (
      <div className="we-status-field">
        <span className="we-status-key">当前地点</span>
        <span
          className={`we-status-value we-status-editable${location ? '' : ' we-status-null'}`}
          onClick={() => { setDraft(location ?? ''); setEditing(true); }}
        >
          {location || '未设定'}
        </span>
      </div>
    );
  }

  return (
    <div className="we-status-field we-status-field--editing">
      <span className="we-status-key">当前地点</span>
      <input
        className="we-input"
        list="we-world-location-options"
        value={draft}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          const trimmed = draft.trim();
          if (trimmed && trimmed !== location) onCommit(trimmed);
        }}
        onKeyDown={(e) => {
          if (isImeComposing(e)) return;
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
      <datalist id="we-world-location-options">
        {locationOptions.map((entity) => <option key={entity.entity_id} value={entity.name} />)}
      </datalist>
    </div>
  );
}

function WorldFactRow({ fact, onDelete }) {
  return (
    <div className="we-sm-fact-row">
      <span className="we-sm-fact-text">{fact.text}</span>
      <span className="we-sm-fact-round">第 {fact.valid_from_round} 轮</span>
      <button type="button" className="we-sm-fact-delete" onClick={onDelete} aria-label={`删除事实：${fact.text}`}>×</button>
    </div>
  );
}

function WorldFacts({ facts, onDelete }) {
  return (
    <div className="we-sm-facts">
      {facts.length === 0 ? (
        <p className="we-section-empty">暂无世界事实</p>
      ) : (
        <div className="we-sm-fact-list">
          {facts.map((fact) => (
            <WorldFactRow key={fact.fact_id} fact={fact} onDelete={() => onDelete(fact.fact_id)} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * 世界现状：当前时间 / 当前地点（状态记忆的 world）+ 世界用户字段（children，由调用方渲染）+ 世界事实。
 */
export default function WorldProfileGroup({ sessionId, world, entities, facts, reload, children }) {
  async function handleTimeCommit(time) {
    try {
      await updateStateWorld(sessionId, { time });
      reload();
    } catch (err) {
      log.error('state.world.time_update_failed', err, { toast: err?.message || '更新当前时间失败' });
    }
  }

  async function handleLocationCommit(location) {
    try {
      await updateStateWorld(sessionId, { location });
      reload();
    } catch (err) {
      log.error('state.world.location_update_failed', err, { toast: err?.message || '更新当前地点失败' });
    }
  }

  async function handleFactDelete(factId) {
    try {
      await deleteStateFact(sessionId, factId);
      reload();
    } catch (err) {
      log.error('state.world.fact_delete_failed', err, { toast: err?.message || '删除世界事实失败' });
    }
  }

  const locationOptions = (entities ?? []).filter((e) => e.type === 'location' && e.status === 'active');

  return (
    <div className="we-state-section we-world-profile-group">
      <div className="we-state-section-title">
        <span className="we-section-label">现状</span>
      </div>
      <div className="we-fields-list">
        <WorldTimeField time={world?.time ?? null} onCommit={handleTimeCommit} />
        <WorldLocationField
          location={world?.location ?? null}
          locationOptions={locationOptions}
          onCommit={handleLocationCommit}
        />
      </div>
      {children}
      <div className="we-sm-facts-wrap">
        <span className="we-status-key">世界事实</span>
        <WorldFacts facts={facts ?? []} onDelete={handleFactDelete} />
      </div>
    </div>
  );
}
