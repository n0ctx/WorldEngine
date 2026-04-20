export default function PageTransition({ children }) {
  return (
    <div style={{
      flex: 1,
      minHeight: 0,
      overflowX: 'hidden',
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {children}
    </div>
  );
}
