export default function ToggleSwitch({ checked, onChange }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        flexShrink: 0,
        position: 'relative',
        display: 'inline-flex',
        height: '24px',
        width: '44px',
        cursor: 'pointer',
        borderRadius: '9999px',
        border: '2px solid transparent',
        transition: 'background-color 0.2s',
        backgroundColor: checked ? 'var(--we-vermilion)' : 'var(--we-paper-shadow)',
      }}
    >
      <span
        style={{
          display: 'inline-block',
          height: '20px',
          width: '20px',
          borderRadius: '9999px',
          backgroundColor: 'var(--we-paper-base)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          transition: 'transform 0.2s',
          transform: checked ? 'translateX(20px)' : 'translateX(0)',
        }}
      />
    </button>
  );
}
