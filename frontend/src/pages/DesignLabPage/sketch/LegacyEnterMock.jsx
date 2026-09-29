/**
 * 固定 CSS 入场的两个样机：「遮罩」盖在页面上淡入，「大面板」单独入场。
 * tone 为 now 时用正式的 we-panel-fade / we-panel-rise，为 sketch 时用 sketch.css 里的出样关键帧。
 */
export default function LegacyEnterMock({ tone }) {
  return (
    <div className={`we-sketch-legacy we-sketch-legacy--${tone}`}>
      <p className="we-sketch-legacy__caption">遮罩</p>
      <div className="we-sketch-legacy__stage">
        <p className="we-sketch-legacy__page">页面内容留在遮罩后面</p>
        <div className="we-sketch-legacy__scrim" />
      </div>
      <p className="we-sketch-legacy__caption">大面板</p>
      <div className="we-sketch-legacy__stage">
        <div className="we-sketch-legacy__panel we-material">
          <h3 className="we-sketch-legacy__title">编辑面板</h3>
          <p>面板整块入场，文字不带模糊。</p>
        </div>
      </div>
    </div>
  );
}
