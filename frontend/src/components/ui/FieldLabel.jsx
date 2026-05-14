export default function FieldLabel({ children, hint, variant = 'default' }) {
  return (
    <label className={[
      'we-edit-label',
      variant === 'settings' ? 'we-edit-label-settings' : '',
    ].filter(Boolean).join(' ')}
    >
      {children}
      {hint && (
        <span className={[
          'we-edit-label-hint',
          variant === 'settings' ? 'we-edit-label-hint-settings' : '',
        ].filter(Boolean).join(' ')}
        >
          {hint}
        </span>
      )}
    </label>
  );
}
