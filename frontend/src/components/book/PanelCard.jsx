/**
 * PanelCard —— 右侧栏卡片化分组外壳。
 * 提供 icon + 标题 + 可选右侧操作；卡内 body 可任意自定义。
 *
 * Props:
 *  - icon: ReactNode 左侧图标（可选）
 *  - title: 标题文案
 *  - actions: 右侧的额外操作 ReactNode（可选）
 *  - className: 追加在卡片根节点上
 *  - children: 卡片正文
 */
export default function PanelCard({
  icon,
  title,
  actions,
  className,
  children,
}) {
  return (
    <section className={`we-panel-card${className ? ` ${className}` : ''}`}>
      <header className="we-panel-card-header">
        {icon && <span className="we-panel-card-icon">{icon}</span>}
        <span className="we-panel-card-title">{title}</span>
        {actions && <span className="we-panel-card-actions">{actions}</span>}
      </header>
      <div className="we-panel-card-collapse we-panel-card-collapse--open">
        <div className="we-panel-card-body">{children}</div>
      </div>
    </section>
  );
}
