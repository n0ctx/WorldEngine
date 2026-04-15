const elevationCls = {
  flat:      'bg-ivory',
  contained: 'bg-ivory border border-border',
  ring:      'bg-ivory border border-border hover:border-accent/40 hover:shadow-ring transition-all',
  whisper:   'bg-ivory border border-border shadow-whisper',
};

export default function Card({
  elevation = 'contained',
  className = '',
  children,
  ...props
}) {
  return (
    <div
      className={[
        'we-card',
        'rounded-xl',
        elevationCls[elevation] ?? elevationCls.contained,
        className,
      ].filter(Boolean).join(' ')}
      {...props}
    >
      {children}
    </div>
  );
}
