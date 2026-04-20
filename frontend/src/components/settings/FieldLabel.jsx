export default function FieldLabel({ children, hint }) {
  return (
    <label className="we-edit-label">
      {children}
      {hint && <span className="we-edit-label-hint">{hint}</span>}
    </label>
  );
}
