/* DESIGN.md §7.7 */
export default function Bookmark() {
  return (
    <div
      style={{
        position: 'absolute',
        top: '-4px',
        right: '72px',
        width: '16px',
        height: '52px',
        background: 'var(--we-vermilion)',
        clipPath: 'polygon(0 0, 100% 0, 100% 82%, 50% 100%, 0 82%)',
        boxShadow: '-1px 2px 6px rgba(0,0,0,0.3)',
        zIndex: 15,
      }}
    />
  );
}
