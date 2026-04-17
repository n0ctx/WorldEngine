const variantCls = {
  default: '',
  accent:  'we-badge-accent',
  error:   'we-badge-error',
};

export default function Badge({
  variant = 'default',
  className = '',
  children,
  ...props
}) {
  return (
    <span
      className={[
        'we-badge',
        variantCls[variant] ?? '',
        className,
      ].filter(Boolean).join(' ')}
      {...props}
    >
      {children}
    </span>
  );
}
