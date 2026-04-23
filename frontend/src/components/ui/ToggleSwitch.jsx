export default function ToggleSwitch({ checked, onChange }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`we-toggle-track${checked ? ' we-toggle-track--enabled' : ''}`}
    >
      <span className={`we-toggle-thumb${checked ? ' we-toggle-thumb--enabled' : ''}`} />
    </button>
  );
}
