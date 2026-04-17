/* DESIGN.md §5.3 §8.2 */
export default function PageLeft({ children, className = '' }) {
  return (
    <div
      style={{
        width: '260px',
        flexShrink: 0,
        background: 'var(--we-paper-aged)',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        borderRadius: 'var(--we-radius-sm) 0 0 var(--we-radius-sm)',
        overflow: 'hidden',
        minHeight: 0,
      }}
      className={className}
    >
      {children}
      {/* 右侧书脊阴影 — DESIGN §8.2 */}
      <div
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: '24px',
          background: 'linear-gradient(to left, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.06) 40%, transparent 100%)',
          pointerEvents: 'none',
          zIndex: 2,
        }}
      />
    </div>
  );
}
