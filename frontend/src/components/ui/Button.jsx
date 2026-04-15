const variantCls = {
  primary:   'bg-accent text-white hover:opacity-90',
  secondary: 'bg-sand text-text-muted border border-border hover:border-accent/40 hover:text-text',
  ghost:     'text-text-secondary hover:text-text hover:bg-sand',
  danger:    'bg-error text-white hover:opacity-90',
};

const sizeCls = {
  sm: 'px-3 py-1.5 text-xs rounded-md',
  md: 'px-4 py-2 text-sm rounded-lg',
  lg: 'px-5 py-2.5 text-sm rounded-lg',
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
        'inline-flex items-center justify-center font-medium transition-all',
        variantCls[variant] ?? variantCls.primary,
        sizeCls[size] ?? sizeCls.md,
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className,
      ].filter(Boolean).join(' ')}
      {...props}
    >
      {children}
    </button>
  );
}
