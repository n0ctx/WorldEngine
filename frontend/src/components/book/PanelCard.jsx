/**
 * PanelCard —— 右侧栏分组外壳。
 *
 * Props:
 *  - icon: ReactNode 左侧图标（headerless 时忽略）
 *  - title: 标题文案（headerless 时忽略）
 *  - actions: 右侧的额外操作 ReactNode（headerless 时忽略，由父级承接）
 *  - variant: 'boxed'(默认 矩形卡片) | 'flush'(融入纸面 章节式 header) | 'headerless'(无 header)
 *  - className: 追加在卡片根节点上
 *  - children: 卡片正文
 */
export default function PanelCard({
  icon,
  title,
  actions,
  variant = 'boxed',
  className,
  children,
}) {
  const showHeader = variant !== 'headerless';
  const cls = `we-panel-card we-panel-card--${variant}${className ? ` ${className}` : ''}`;
  return (
    <section className={cls}>
      {showHeader && (
        <header className="we-panel-card-header">
          {icon && <span className="we-panel-card-icon">{icon}</span>}
          <span className="we-panel-card-title">{title}</span>
          {actions && <span className="we-panel-card-actions">{actions}</span>}
        </header>
      )}
      <div className="we-panel-card-collapse we-panel-card-collapse--open">
        <div className="we-panel-card-body">{children}</div>
      </div>
    </section>
  );
}
