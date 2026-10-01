import Button from './Button.jsx';

/**
 * 只有图标的按钮：Button 的方形版本，边长取控件高度（sm 28 / md 36 / lg 44）。
 * label 必填，同时作为读屏名称和悬停提示。
 * variant 默认 ghost；danger 平时同 ghost、悬停才露危险色；overlay 用于压在封面图上。
 */
export default function IconButton({
  label,
  variant = 'ghost',
  size = 'md',
  className = '',
  children,
  ...props
}) {
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={['we-btn-icon', className].filter(Boolean).join(' ')}
      aria-label={label}
      title={label}
      {...props}
    >
      {children}
    </Button>
  );
}
