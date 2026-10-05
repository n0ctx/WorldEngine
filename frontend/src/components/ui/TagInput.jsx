import { useState } from 'react';
import { IconClose } from './icons.jsx';
import { isImeComposing } from '../../core/utils/ime.js';
import Badge from './Badge.jsx';

/**
 * 标签输入：外框同中号输入框，已有的值显示成可删的标签。
 * 回车添加（去掉首尾空白、去重、不超过 max），输入框为空时退格删掉最后一个；失焦时把没回车的文字也加上（commitOnBlur）。
 * 增删只通过 onAdd(value) / onRemove(value) 交给调用方写回。
 */
export default function TagInput({
  values,
  onAdd,
  onRemove,
  max,
  label,
  placeholder = '输入后按回车',
  disabled = false,
  commitOnBlur = true,
  inputRef,
  onKeyDown,
  className = '',
}) {
  const [text, setText] = useState('');
  const atMax = max != null && values.length >= max;

  function add(raw) {
    const value = raw.trim();
    if (!value || values.includes(value) || atMax) return;
    setText('');
    onAdd(value);
  }

  function handleKeyDown(event) {
    onKeyDown?.(event);
    if (event.defaultPrevented || isImeComposing(event)) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      add(text);
    } else if (event.key === 'Backspace' && text === '' && values.length) {
      onRemove(values[values.length - 1]);
    }
  }

  return (
    <div
      className={['we-tag-input', className].filter(Boolean).join(' ')}
      role="group"
      aria-label={label}
      onClick={(event) => event.currentTarget.querySelector('input')?.focus()}
    >
      {values.map((value) => (
        <Badge key={value} className="we-tag-input__tag">
          {value}
          <button
            type="button"
            className="we-tag-input__remove"
            aria-label={`删除 ${value}`}
            disabled={disabled}
            onClick={(event) => { event.stopPropagation(); onRemove(value); }}
          >
            <IconClose size={12} />
          </button>
        </Badge>
      ))}
      <input
        ref={inputRef}
        className="we-tag-input__field"
        value={text}
        disabled={disabled || atMax}
        placeholder={atMax ? `最多 ${max} 项` : placeholder}
        aria-label={label}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => { if (commitOnBlur) add(text); }}
      />
    </div>
  );
}
