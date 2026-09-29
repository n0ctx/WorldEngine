export default function Section({ id, title, meta, actions, children, stageClassName = '' }) {
  return (
    <section className="we-design-lab__section" aria-labelledby={id}>
      <div className="we-design-lab__bar">
        <h2 id={id} className="we-design-lab__heading">{title}</h2>
        {actions}
      </div>
      {meta}
      {children && <div className={`we-design-lab__stage ${stageClassName}`}>{children}</div>}
    </section>
  );
}
