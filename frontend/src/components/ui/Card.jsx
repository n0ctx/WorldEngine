const elevationCls = {
  flat:      'we-card-flat',
  contained: '',
  ring:      'we-card-ring',
  whisper:   'we-card-whisper',
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
        elevationCls[elevation] ?? '',
        className,
      ].filter(Boolean).join(' ')}
      {...props}
    >
      {children}
    </div>
  );
}
