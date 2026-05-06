import { useState, useEffect, useRef } from 'react';

const ISO_RE = /^(\d+)-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const MAX_YEAR_DIGITS = 9;

function parse(value) {
  if (typeof value !== 'string' || value === '') {
    return { y: '', mo: '', d: '', h: '', mi: '' };
  }
  const m = value.match(ISO_RE);
  if (!m) return { y: '', mo: '', d: '', h: '', mi: '' };
  return { y: String(parseInt(m[1], 10)), mo: m[2], d: m[3], h: m[4], mi: m[5] };
}

function compose(parts) {
  const { y, mo, d, h, mi } = parts;
  if (y === '' || mo === '' || d === '' || h === '' || mi === '') return '';
  const yi = parseInt(y, 10);
  const moi = parseInt(mo, 10);
  const di = parseInt(d, 10);
  const hi = parseInt(h, 10);
  const mii = parseInt(mi, 10);
  if (![yi, moi, di, hi, mii].every(Number.isFinite)) return '';
  if (yi < 1 || moi < 1 || moi > 12 || di < 1 || di > 31 || hi < 0 || hi > 23 || mii < 0 || mii > 59) return '';
  return `${String(yi)}-${String(moi).padStart(2, '0')}-${String(di).padStart(2, '0')}T${String(hi).padStart(2, '0')}:${String(mii).padStart(2, '0')}`;
}

const SEG_DEFS = [
  { key: 'y',  maxLen: MAX_YEAR_DIGITS, placeholder: 'YYYY', width: '5em' },
  { key: 'mo', maxLen: 2, placeholder: 'MM',   width: '3em' },
  { key: 'd',  maxLen: 2, placeholder: 'DD',   width: '3em' },
  { key: 'h',  maxLen: 2, placeholder: 'HH',   width: '3em' },
  { key: 'mi', maxLen: 2, placeholder: 'mm',   width: '3em' },
];

/**
 * 拆分式 datetime 输入：年/月/日/时/分 五个独立文本输入，规避 <input type="datetime-local">
 * 在年份 < 1000 时的浏览器自动补齐 bug。
 *
 * 便利交互：
 *   - 当前段输入达到 maxLen 时自动跳到下一段
 *   - 在空段按 Backspace 自动跳回上一段
 *
 * Props:
 *   value      — 字符串 "YYYY-MM-DDTHH:mm"，或空字符串
 *   onChange   — (composed: string) => void；composed 合法时为规范化字符串，否则为 ""
 *   onBlur     — 整个组件失焦（焦点未移入子元素）时触发
 *   onKeyDown  — 透传到容器，事件冒泡可被外部捕获（如 Enter 提交）
 *   disabled   — 禁用全部输入
 *   autoFocus  — 进入时聚焦年份输入
 *   className  — 同时应用到容器和每个段位 input（用于尺寸/字体定制，如 we-status-inline-input）
 */
export default function DatetimeSplitInput({
  value, onChange, onBlur, onKeyDown, disabled, autoFocus, className = '',
}) {
  const [parts, setParts] = useState(() => parse(value));
  const lastEmittedRef = useRef(compose(parse(value)));
  const refs = useRef(SEG_DEFS.map(() => null));

  useEffect(() => {
    const incoming = value ?? '';
    if (incoming !== lastEmittedRef.current) {
      setParts(parse(incoming));
      lastEmittedRef.current = incoming;
    }
  }, [value]);

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  function emit(next) {
    setParts(next);
    const composed = compose(next);
    lastEmittedRef.current = composed;
    onChange?.(composed);
  }

  function handleChange(idx, raw) {
    const def = SEG_DEFS[idx];
    const cleaned = raw.replace(/\D/g, '').slice(0, def.maxLen);
    const next = { ...parts, [def.key]: cleaned };
    emit(next);
    // 年份是变长（最大 6 位），不自动跳；其他段满 2 位即跳到下一段
    if (def.key !== 'y' && cleaned.length === def.maxLen && idx < SEG_DEFS.length - 1) {
      refs.current[idx + 1]?.focus();
      refs.current[idx + 1]?.select?.();
    }
  }

  function handleSegKeyDown(idx, e) {
    const def = SEG_DEFS[idx];
    if (e.key === 'Backspace' && parts[def.key] === '' && idx > 0) {
      e.preventDefault();
      const prev = refs.current[idx - 1];
      prev?.focus();
      // 把光标移到末尾
      const len = prev?.value?.length ?? 0;
      try { prev?.setSelectionRange(len, len); } catch { /* ignore */ }
    }
    if (e.key === 'ArrowLeft' && e.target.selectionStart === 0 && idx > 0) {
      e.preventDefault();
      refs.current[idx - 1]?.focus();
    }
    if (e.key === 'ArrowRight' && e.target.selectionStart === parts[def.key].length && idx < SEG_DEFS.length - 1) {
      e.preventDefault();
      refs.current[idx + 1]?.focus();
    }
  }

  function handleBlur(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      onBlur?.(e);
    }
  }

  return (
    <div
      className={`we-datetime-split ${className}`}
      onBlur={handleBlur}
      onKeyDown={onKeyDown}
    >
      {SEG_DEFS.map((def, idx) => (
        <span key={def.key} className="we-datetime-split-seg">
          {idx > 0 && (
            <span className="we-datetime-split-sep">
              {def.key === 'h' ? 'T' : def.key === 'mi' ? ':' : '-'}
            </span>
          )}
          <input
            ref={(el) => { refs.current[idx] = el; }}
            type="text" inputMode="numeric"
            className={`we-input ${className}`}
            style={{ width: def.width }}
            value={parts[def.key]} placeholder={def.placeholder}
            disabled={disabled}
            onChange={(e) => handleChange(idx, e.target.value)}
            onKeyDown={(e) => handleSegKeyDown(idx, e)}
          />
        </span>
      ))}
    </div>
  );
}
