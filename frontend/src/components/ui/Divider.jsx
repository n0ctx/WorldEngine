/** 分隔线：1px 淡色，上下留白 md / lg 两档。 */
export default function Divider({ size = 'md', className = '' }) {
  return <hr className={['we-divider', size === 'lg' && 'we-divider--lg', className].filter(Boolean).join(' ')} />;
}
