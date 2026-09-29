import { useState } from 'react';

export default function ToggleSwitch({ checked, onChange, disabled = false }) {
  // 用户拨过之后才让动效包播圆钮动画，页面刚加载时已经打开的开关不抖
  const [touched, setTouched] = useState(false);
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      data-touched={touched || undefined}
      onClick={() => { setTouched(true); onChange(!checked); }}
      className={`we-toggle-track${checked ? ' we-toggle-track--enabled' : ''}`}
    >
      <span className={`we-toggle-thumb${checked ? ' we-toggle-thumb--enabled' : ''}`} />
    </button>
  );
}
