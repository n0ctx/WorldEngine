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
        borderRadius: '0',
        overflow: 'hidden',
        minHeight: 0,
        padding: '44px 52px 28px 60px',
      }}
      className={className}
    >
      {children}
    </div>
  );
}
