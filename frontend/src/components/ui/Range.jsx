import { useMemo } from 'react';

const RANGE_PCT_CLASS = {
  0: '[--range-pct:0%]',
  5: '[--range-pct:5%]',
  10: '[--range-pct:10%]',
  15: '[--range-pct:15%]',
  20: '[--range-pct:20%]',
  25: '[--range-pct:25%]',
  30: '[--range-pct:30%]',
  35: '[--range-pct:35%]',
  40: '[--range-pct:40%]',
  45: '[--range-pct:45%]',
  50: '[--range-pct:50%]',
  55: '[--range-pct:55%]',
  60: '[--range-pct:60%]',
  65: '[--range-pct:65%]',
  70: '[--range-pct:70%]',
  75: '[--range-pct:75%]',
  80: '[--range-pct:80%]',
  85: '[--range-pct:85%]',
  90: '[--range-pct:90%]',
  95: '[--range-pct:95%]',
  100: '[--range-pct:100%]',
};

function rangeFraction(value, min, max) {
  if (Number(max) <= Number(min)) return 0;
  const normalized = (Number(value) - Number(min)) / (Number(max) - Number(min));
  return Math.max(0, Math.min(1, normalized));
}

function calculatePercentage(value, min, max) {
  return Math.round(rangeFraction(value, min, max) * 100 / 5) * 5;
}

export default function Range({
  value = 0,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  className = '',
  ...props
}) {
  const pct = useMemo(() => calculatePercentage(value, min, max), [value, min, max]);
  const pctClass = RANGE_PCT_CLASS[pct] || RANGE_PCT_CLASS[0];

  // 外层给动效包挂圆钮上的准星：--range-v 是不取整的 0–1 位置，准星要贴着圆钮走
  return (
    <span className="we-range-field" style={{ '--range-v': rangeFraction(value, min, max) }}>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={onChange}
        className={`we-range ${pctClass} ${className}`.trim()}
        {...props}
      />
    </span>
  );
}
