/**
 * 列表项：导航与侧栏列表里的一行。无框，悬停浅底，选中强调色淡底。
 * 默认是按钮；选中项由调用方同时给 aria-current 或 aria-selected。
 */
export default function ListItem({ as: Tag = 'button', selected = false, className = '', children, ...props }) {
  return (
    <Tag
      type={Tag === 'button' ? 'button' : undefined}
      className={['we-list-item', selected && 'is-selected', className].filter(Boolean).join(' ')}
      {...props}
    >
      {children}
    </Tag>
  );
}
