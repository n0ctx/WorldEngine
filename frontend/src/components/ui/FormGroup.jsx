import FieldLabel from './FieldLabel';

export default function FormGroup({ label, required, hint, error, children }) {
  return (
    <div className="we-edit-form-group">
      {label && (
        <FieldLabel>
          {label}
          {required && <span className="we-form-required"> *</span>}
        </FieldLabel>
      )}
      {children}
      {hint && <p className="we-edit-hint">{hint}</p>}
      {error && <p className="we-edit-error">{error}</p>}
    </div>
  );
}
