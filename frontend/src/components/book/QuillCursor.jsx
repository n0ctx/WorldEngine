export default function QuillCursor({ visible }) {
  if (!visible) return null;
  return (
    <span
      className="we-quill-cursor"
      style={{ display: 'inline-block', verticalAlign: 'middle', marginLeft: 3 }}
    >
      <svg width="12" height="19" viewBox="0 0 20 32">
        <path
          d="M10 30 Q6 20 4 8 Q10 2 16 8 Q14 20 10 30Z"
          fill="none"
          stroke="var(--we-ink-faded)"
          strokeWidth="1.2"
        />
        <line
          x1="10" y1="30" x2="10" y2="32"
          stroke="var(--we-ink-primary)"
          strokeWidth="1.5"
        />
      </svg>
    </span>
  );
}
