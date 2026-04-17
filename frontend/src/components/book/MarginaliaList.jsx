export default function MarginaliaList({ items }) {
  if (!items || items.length === 0) {
    return (
      <div className="we-marginalia-list">
        <p style={{ fontSize: 10, color: 'var(--we-ink-faded)', fontStyle: 'italic', margin: 0 }}>暂无召回记忆</p>
      </div>
    );
  }
  return (
    <div className="we-marginalia-list">
      {items.map((item) => (
        <div key={item.id} className="we-marginalia">
          <div className="we-marginalia-date">{item.date}</div>
          <div className="we-marginalia-text">{item.text}</div>
        </div>
      ))}
    </div>
  );
}
