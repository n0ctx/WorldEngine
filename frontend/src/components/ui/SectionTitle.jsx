const DEFAULT_TAG = { section: 'h2', group: 'h3', eyebrow: 'div' };

/**
 * 小节标题，三级：section 区块标题 / group 小标题 / eyebrow 分节标签。
 * rule：under 下方一条淡线，beside 右侧一条线延到行尾；actions 放在行尾。
 * as 只换标题文字的元素（默认 h2 / h3 / div），操作按钮不进标题元素。
 */
export default function SectionTitle({ level = 'eyebrow', rule, actions, as, id, className = '', children }) {
  const Tag = as ?? DEFAULT_TAG[level];
  const cls = ['we-section-title', `we-section-title--${level}`, rule && `we-section-title--rule-${rule}`, className]
    .filter(Boolean).join(' ');
  return (
    <div className={cls}>
      <Tag id={id} className="we-section-title__text">{children}</Tag>
      {actions && <div className="we-section-title__actions">{actions}</div>}
    </div>
  );
}
