/**
 * 出样对照：左边「现在」是正式组件的现状，右边「出样」是待确认的新动效（未落地）。
 * 只传 children 时两边渲染同一份内容，右边再套上 sketchClass，由 sketch.css 覆盖动效相关样式；
 * 两边内容不同（如入场类要用 framer-motion）时分别传 now 与 sketch。
 */
export default function Compare({ now, sketch, sketchClass = '', children }) {
  return (
    <div className="we-sketch-compare">
      <div className="we-sketch-compare__col">
        <p className="we-sketch-compare__tag">现在</p>
        <div className="we-sketch-compare__body">{now ?? children}</div>
      </div>
      <div className="we-sketch-compare__col we-sketch-compare__col--sketch">
        <p className="we-sketch-compare__tag">出样 · 未落地</p>
        <div className={`we-sketch-compare__body ${sketchClass}`.trim()}>{sketch ?? children}</div>
      </div>
    </div>
  );
}
