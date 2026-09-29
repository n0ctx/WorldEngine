// 一组颜色 token 的色块：名字取 token 去掉前缀后的部分
export function SwatchGroup({ title, prefix, names }) {
  return (
    <div>
      <h3 className="we-design-lab__subheading">{title}</h3>
      <div className="we-design-lab__swatches">
        {names.map((name) => (
          <div key={name} className="we-design-lab__swatch-cell">
            <span className="we-design-lab__swatch-chip" style={{ '--lab-token': `var(${prefix}${name})` }} />
            <span className="we-design-lab__swatch-name">{name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
