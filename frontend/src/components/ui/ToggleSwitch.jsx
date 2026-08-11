export default function ToggleSwitch({ checked, onChange, disabled = false }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`we-toggle-track${checked ? ' we-toggle-track--enabled' : ''}`}
    >
      <span className={`we-toggle-thumb${checked ? ' we-toggle-thumb--enabled' : ''}`} />
    </button>
  );
}
