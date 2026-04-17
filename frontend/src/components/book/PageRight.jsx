/* DESIGN.md §5.4 §8.2 */
export default function PageRight({ children, className = '' }) {
  return (
    <div
      style={{
        flex: 1,
        background: 'var(--we-paper-base)',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        borderRadius: '0 var(--we-radius-sm) var(--we-radius-sm) 0',
        overflow: 'hidden',
        minHeight: 0,
        padding: '44px 52px 28px 60px',
      }}
      className={className}
    >
      {/* 左侧书脊阴影 — DESIGN §8.2 */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: '24px',
          background: 'linear-gradient(to right, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.06) 40%, transparent 100%)',
          pointerEvents: 'none',
          zIndex: 1,
        }}
      />
      {children}
    </div>
  );
}
