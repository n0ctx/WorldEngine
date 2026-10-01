import { Check } from 'lucide-react';

/**
 * 复选框：原生 input 负责键盘与读屏，旁边画一个方框；勾取压在强调色上的字色。
 * onChange 收到布尔值。没有可见文字时传 label 作为读屏名称。
 */
export default function Checkbox({ checked, onChange, disabled = false, label, children, className = '', ...props }) {
  return (
    <label className={['we-checkbox', className].filter(Boolean).join(' ')}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={children ? undefined : label}
        onChange={(e) => onChange(e.target.checked)}
        {...props}
      />
      <span className="we-checkbox__box" aria-hidden="true"><Check size={12} strokeWidth={3} /></span>
      {children}
    </label>
  );
}
