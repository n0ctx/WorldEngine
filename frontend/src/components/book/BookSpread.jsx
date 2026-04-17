/* DESIGN.md §5 §8.1 §8.2 */
import ParchmentTexture from './ParchmentTexture.jsx';
import Bookmark from './Bookmark.jsx';

export default function BookSpread({ children, className = '' }) {
  return (
    /* 铺满父容器（Routes 区域），侧边留细窄深棕边框 */
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      padding: '0 12px 8px',
      boxSizing: 'border-box',
    }}>
      {/* 书本本体：铺满剩余高度，最大 1120px 居中 */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          maxWidth: '1120px',
          width: '100%',
          margin: '0 auto',
          position: 'relative',
          boxShadow: '0 24px 64px rgba(0,0,0,0.55), 0 4px 16px rgba(0,0,0,0.35)',
          borderRadius: '0 0 2px 2px',
          overflow: 'hidden',
          minHeight: 0,
        }}
        className={className}
      >
        <Bookmark />
        {children}
        <ParchmentTexture />
      </div>
    </div>
  );
}
