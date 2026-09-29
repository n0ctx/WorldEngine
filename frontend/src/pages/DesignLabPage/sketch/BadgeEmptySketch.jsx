import Badge from '../../../components/ui/Badge.jsx';
import Button from '../../../components/ui/Button.jsx';

const BADGES = [['默认', 'default'], ['强调', 'accent'], ['错误', 'error']];

const noop = () => {};

// 正式 EmptyState 的内部元素套不上动效，出样按同样的类名与结构重画一份；按钮仍是正式的 Button。
// 入场全部由 sketch/enter.css 按当前动效包驱动，--i 是徽标的入场顺序。
export default function BadgeEmptySketch() {
  return (
    <div className="we-sketch-enter we-design-lab__grid">
      <div className="we-design-lab__row">
        {BADGES.map(([label, variant], i) => (
          <span key={variant} className="we-sketch-enter__badge" style={{ '--i': i }}>
            <Badge variant={variant}>{label}</Badge>
          </span>
        ))}
      </div>
      <div className="we-empty-state">
        <h2 className="we-empty-state__title">还没有世界</h2>
        <p className="we-empty-state__hint">创建第一个世界，开始写故事。</p>
        <div className="we-empty-state__actions">
          <Button variant="primary" onClick={noop}>创建世界</Button>
          <Button variant="ghost" onClick={noop}>导入</Button>
        </div>
      </div>
    </div>
  );
}
