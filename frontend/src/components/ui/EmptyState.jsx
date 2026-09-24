import Button from './Button.jsx';

/**
 * EmptyState — 统一空状态组件。
 * 结构：icon(可选) → title → hint(可选) → primaryAction → secondaryAction(可选)
 *
 * @param {string} title - 一句话说明（必填）
 * @param {string} [hint] - 解释"这是什么"的辅助文本
 * @param {{label: string, onClick: Function, to?: string}} [primaryAction] - 主操作按钮
 * @param {{label: string, onClick: Function}} [secondaryAction] - 次操作按钮
 * @param {React.ReactNode} [icon] - 装饰图标（可选）
 * @param {string} [className] - 额外类名
 */
export default function EmptyState({
  title,
  hint,
  primaryAction,
  secondaryAction,
  icon,
  className = '',
}) {
  return (
    <div className={`we-empty-state ${className}`.trim()}>
      {icon && <div className="we-empty-state__icon">{icon}</div>}
      <h2 className="we-empty-state__title">{title}</h2>
      {hint && <p className="we-empty-state__hint">{hint}</p>}
      {(primaryAction || secondaryAction) && (
        <div className="we-empty-state__actions">
          {primaryAction && (
            <Button variant="primary" onClick={primaryAction.onClick}>
              {primaryAction.label}
            </Button>
          )}
          {secondaryAction && (
            <Button variant="ghost" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
