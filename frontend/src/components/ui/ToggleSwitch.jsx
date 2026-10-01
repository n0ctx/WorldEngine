import { useState } from 'react';

/** 开关：md 用在设置行，sm 用在列表行里。没有可见文字时传 label 作为读屏名称。 */
export default function ToggleSwitch({ checked, onChange, disabled = false, size = 'md', label }) {
  // 用户拨过之后才让动效包播圆钮动画，页面刚加载时已经打开的开关不抖
  const [touched, setTouched] = useState(false);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      data-touched={touched || undefined}
      onClick={() => { setTouched(true); onChange(!checked); }}
      className={['we-toggle-track', checked ? 'we-toggle-track--enabled' : '', size === 'sm' ? 'we-toggle-track--sm' : '']
        .filter(Boolean).join(' ')}
    >
      <span className={`we-toggle-thumb${checked ? ' we-toggle-thumb--enabled' : ''}`} />
    </button>
  );
}
