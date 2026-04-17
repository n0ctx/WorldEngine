/* DESIGN.md §5 §8.1 §8.2 */
import ParchmentTexture from './ParchmentTexture.jsx';
import Bookmark from './Bookmark.jsx';

export default function BookSpread({ children, className = '' }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--we-book-bg)',
        padding: '32px 24px',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          flex: 1,
          display: 'flex',
          minHeight: '700px',
          maxWidth: '1120px',
          width: '100%',
          margin: '0 auto',
          position: 'relative',
          boxShadow: '0 24px 64px rgba(0,0,0,0.55), 0 4px 16px rgba(0,0,0,0.35)',
          borderRadius: '2px',
          overflow: 'hidden',
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
