// 卡片的类名拼法：Card 用它，只要类名、交给别的组件渲染的地方（如 Checkbox、TaskList 的条目）也用它
export function cardClassName({ variant = 'raised', density = 'default', interactive = false, selected = false, className = '' } = {}) {
  return [
    'we-card',
    `we-card--${variant}`,
    density !== 'default' && `we-card--${density}`,
    interactive && 'is-interactive',
    selected && 'is-selected',
    className,
  ].filter(Boolean).join(' ');
}
