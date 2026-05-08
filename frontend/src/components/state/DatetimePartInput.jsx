import Select from '../ui/Select';

const PART_OPTIONS = [
  { value: 'year',   label: '年' },
  { value: 'month',  label: '月' },
  { value: 'day',    label: '日' },
  { value: 'hour',   label: '时' },
  { value: 'minute', label: '分' },
];

const PART_CONSTRAINTS = {
  year:   { min: 1,    max: 99999, placeholder: '年份' },
  month:  { min: 1,    max: 12,    placeholder: '1–12' },
  day:    { min: 1,    max: 31,    placeholder: '1–31' },
  hour:   { min: 0,    max: 23,    placeholder: '0–23' },
  minute: { min: 0,    max: 59,    placeholder: '0–59' },
};

const LEGACY_ISO_RE = /^(\d+)-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

function parseValue(raw) {
  if (!raw || typeof raw !== 'string') return { part: 'year', num: '' };
  const m = raw.match(/^(year|month|day|hour|minute):(\d*)$/);
  if (m) return { part: m[1], num: m[2] };
  // 旧格式兼容：ISO 全量字符串回填为年份，至少能显示有意义的值
  const iso = raw.match(LEGACY_ISO_RE);
  if (iso) return { part: 'year', num: String(parseInt(iso[1], 10)) };
  return { part: 'year', num: '' };
}

function compose(part, num) {
  if (!part) return '';
  return `${part}:${num}`;
}

/**
 * datetime 字段的条件值输入：下拉选择部分（年/月/日/时/分）+ 数字输入框
 *
 * Props:
 *   value    — "year:2024" / "month:3" / "" 等格式
 *   onChange — (composed: string) => void
 *   className
 */
export default function DatetimePartInput({ value, onChange, className = '' }) {
  const { part, num } = parseValue(value);

  function handlePartChange(newPart) {
    onChange(compose(newPart, num));
  }

  function handleNumChange(e) {
    const raw = e.target.value.replace(/\D/g, '');
    if (raw === '') { onChange(compose(part, '')); return; }
    const n = parseInt(raw, 10);
    const clamped = n > constraint.max ? String(constraint.max) : raw;
    onChange(compose(part, clamped));
  }

  const constraint = PART_CONSTRAINTS[part] ?? PART_CONSTRAINTS.year;

  return (
    <div className={`we-datetime-part-input ${className}`}>
      <Select
        value={part}
        onChange={handlePartChange}
        options={PART_OPTIONS}
      />
      <input
        type="text"
        inputMode="numeric"
        value={num}
        onChange={handleNumChange}
        placeholder={constraint.placeholder}
        className="we-entry-condition-input"
        style={{ width: '6em' }}
      />
    </div>
  );
}
