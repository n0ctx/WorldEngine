/**
 * 静态标签：小方角、浅底、无描边，和可点的胶囊按钮区分开。
 * tone：neutral 默认 / accent 强调 / success 新增、成功 / warning 覆盖、提醒 / danger 错误 / info 信息。
 */
export default function Badge({ tone = 'neutral', className = '', children, ...props }) {
  return (
    <span className={['we-badge', `we-badge--${tone}`, className].filter(Boolean).join(' ')} {...props}>
      {children}
    </span>
  );
}
