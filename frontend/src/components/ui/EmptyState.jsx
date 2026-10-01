import Button from './Button.jsx';

/**
 * EmptyState — 统一空状态组件。
 * size：lg 整页（图标、标题、说明、操作，带入场动效）/ sm 行内（一句说明加一行可选补充，放在列表、面板里）。
 * 结构：icon(可选) → title → hint(可选) → primaryAction → secondaryAction(可选)
 *
 * @param {string} title - 一句话说明（必填）
 * @param {string} [hint] - 解释"这是什么"的辅助文本
 * @param {{label: string, onClick: Function, to?: string}} [primaryAction] - 主操作按钮
 * @param {{label: string, onClick: Function}} [secondaryAction] - 次操作按钮
 * @param {React.ReactNode} [icon] - 装饰图标（可选）
 * @param {'lg'|'sm'} [size] - 尺寸，默认 lg
 * @param {string} [className] - 额外类名
 */
export default function EmptyState({
  title,
  hint,
  primaryAction,
  secondaryAction,
  icon,
  size = 'lg',
  className = '',
}) {
  if (size === 'sm') {
    return (
      <div className={`we-empty-state we-empty-state--sm ${className}`.trim()}>
        <p className="we-empty-state__title">{title}</p>
        {hint && <p className="we-empty-state__hint">{hint}</p>}
      </div>
    );
  }
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
            <Button variant="secondary" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
