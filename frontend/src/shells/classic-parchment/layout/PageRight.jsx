/* DESIGN.md §5.4 §8.2 */
export default function PageRight({ children, className = '' }) {
  return (
    <div
      className={['we-page-right', className].filter(Boolean).join(' ')}
    >
      {children}
    </div>
  );
}
