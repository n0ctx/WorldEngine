import { useEffect, useState } from 'react';
import FormGroup from '../ui/FormGroup';
import Input from '../ui/Input';
import DatetimeSplitInput from './DatetimeSplitInput.jsx';
import { getWorldProfileDefaults, updateWorldProfileDefault } from '../../core/api/world-profile-defaults.js';
import { log } from '../../core/utils/logger.js';

const WORLD_DATE_RE = /^\d+-\d{2}-\d{2}(?:T\d{2}:\d{2})?$/;

/** 世界卡的开场时间、开场地点。新会话还没有世界档案时会带入。 */
export default function WorldProfileDefaultsFields({ worldId }) {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    let cancelled = false;
    getWorldProfileDefaults(worldId)
      .then((next) => { if (!cancelled) setRows(next); })
      .catch((err) => log.error('world.profile_defaults.load_failed', err, { toast: err.message || '档案默认值加载失败' }));
    return () => { cancelled = true; };
  }, [worldId]);

  async function save(fieldKey, valueJson) {
    try {
      await updateWorldProfileDefault(worldId, fieldKey, valueJson);
    } catch (err) {
      log.error('world.profile_defaults.save_failed', err, { toast: err.message || '档案默认值保存失败' });
    }
  }

  if (rows.length === 0) return null;
  const time = rows.find((row) => row.field_key === 'time');
  const location = rows.find((row) => row.field_key === 'location');

  return (
    <FormGroup label="档案默认值" hint="新会话开始时带入。已有会话里的当前时间、当前地点不会被覆盖。">
      <div className="we-state-value-list">
        {time && <TimeDefault row={time} onSave={save} />}
        {location && <LocationDefault row={location} onSave={save} />}
      </div>
    </FormGroup>
  );
}

function storedText(valueJson) {
  if (valueJson == null) return '';
  try {
    const parsed = JSON.parse(valueJson);
    return typeof parsed === 'string' ? parsed : '';
  } catch {
    return '';
  }
}

function TimeDefault({ row, onSave }) {
  const value = storedText(row.value_json);
  return (
    <div className="we-state-value-row">
      <p className="we-state-value-label">{row.label}</p>
      <DatetimeSplitInput
        value={WORLD_DATE_RE.test(value) ? value : ''}
        onChange={(next) => { if (next === '') return; onSave(row.field_key, JSON.stringify(next)); }}
        onBlur={(event) => {
          const digits = event.currentTarget.querySelector('input')?.value ?? '';
          if (digits === '' && value) onSave(row.field_key, null);
        }}
      />
    </div>
  );
}

function LocationDefault({ row, onSave }) {
  const value = storedText(row.value_json);
  const [draft, setDraft] = useState(value);
  return (
    <div className="we-state-value-row">
      <p className="we-state-value-label">{row.label}</p>
      <Input
        value={draft}
        placeholder="开场地点"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const trimmed = draft.trim();
          if (trimmed === value) return;
          onSave(row.field_key, trimmed ? JSON.stringify(trimmed) : null);
        }}
      />
    </div>
  );
}
