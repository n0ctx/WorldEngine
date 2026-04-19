const sizeCls = {
  sm: 'we-btn-sm',
  md: '',
  lg: 'we-btn-lg',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  disabled = false,
  className = '',
  children,
  ...props
}) {
  return (
    <button
      disabled={disabled}
      className={[
        'we-btn',
        `we-btn-${variant}`,
        sizeCls[size] ?? '',
        className,
      ].filter(Boolean).join(' ')}
      {...props}
    >
      {children}
    </button>
  );
}
