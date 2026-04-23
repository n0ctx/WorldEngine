/* DESIGN.md §5 §8.1 §8.2 */
import ParchmentTexture from './ParchmentTexture.jsx';

export default function BookSpread({ children, className = '' }) {
  return (
    /* 铺满父容器（Routes 区域），侧边留细窄深棕边框 */
    <div className="we-book-spread-outer">
      {/* 书本本体：铺满剩余高度，最大 1120px 居中 */}
      <div className={`we-book-spread-inner ${className}`}>
        {children}
        <ParchmentTexture opacity={0.55} />
      </div>
    </div>
  );
}
