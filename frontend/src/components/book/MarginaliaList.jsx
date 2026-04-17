export default function MarginaliaList({ items }) {
  if (!items || items.length === 0) return null;

  return (
    <div className="we-marginalia-list">
      {items.map((item, i) => (
        <div
          key={item.id}
          className="we-marginalia"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          {item.date && <div className="we-marginalia-date">{item.date}</div>}
          <div className="we-marginalia-text">{item.text}</div>
        </div>
      ))}
    </div>
  );
}
