import FieldLabel from './FieldLabel';

export default function FormGroup({ label, required, hint, error, children, variant = 'default' }) {
  return (
    <div className={[
      'we-edit-form-group',
      variant === 'settings' ? 'we-edit-form-group-settings' : '',
    ].filter(Boolean).join(' ')}
    >
      {label && (
        <FieldLabel variant={variant}>
          {label}
          {required && <span className="we-form-required"> *</span>}
        </FieldLabel>
      )}
      {children}
      {hint && (
        <p className={[
          'we-edit-hint',
          variant === 'settings' ? 'we-edit-hint-settings' : '',
        ].filter(Boolean).join(' ')}
        >
          {hint}
        </p>
      )}
      {error && (
        <p className={[
          'we-edit-error',
          variant === 'settings' ? 'we-edit-error-settings' : '',
        ].filter(Boolean).join(' ')}
        >
          {error}
        </p>
      )}
    </div>
  );
}
