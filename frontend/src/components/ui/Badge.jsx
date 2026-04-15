const variantCls = {
  default: 'bg-sand text-text-muted',
  accent:  'bg-accent/10 text-accent',
  error:   'bg-error/10 text-error',
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
        'inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-xl',
        variantCls[variant] ?? variantCls.default,
        className,
      ].filter(Boolean).join(' ')}
      {...props}
    >
      {children}
    </span>
  );
}
