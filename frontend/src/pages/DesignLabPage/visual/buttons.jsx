import { IconArrowUp, IconChevronRight, IconDownload, IconPencil, IconTrash } from '../../../components/ui/icons.jsx';
import Button from '../../../components/ui/Button.jsx';
import IconButton from '../../../components/ui/IconButton.jsx';
import VisualSection from '../VisualSection.jsx';

const noop = () => {};

const TONES = [['primary', '主要'], ['secondary', '次要'], ['ghost', '幽灵'], ['text', '文字'], ['danger', '危险']];
const SIZES = [['sm', '小 28'], ['md', '中 36'], ['lg', '大 44']];
const ICON_PX = { sm: 16, md: 20, lg: 20 };

export function ButtonsDemo() {
  return (
    <VisualSection id="buttons">
      <div className="we-design-lab__grid">
        <div className="we-design-lab__grid">
          <h3 className="we-design-lab__subheading">带字按钮：色调 × 尺寸；「文字」色调贴着文字走，用于返回和消息下方这类安静的操作</h3>
          {SIZES.map(([size, label]) => (
            <div key={size} className="we-design-lab__row">
              <span className="we-design-lab__count">{label}</span>
              {TONES.map(([tone, toneLabel]) => (
                <Button key={tone} variant={tone} size={size} onClick={noop}>{toneLabel}</Button>
              ))}
            </div>
          ))}
          <div className="we-design-lab__row">
            <span className="we-design-lab__count">不可用</span>
            {TONES.map(([tone, toneLabel]) => <Button key={tone} variant={tone} disabled>{toneLabel}</Button>)}
          </div>
        </div>

        <div className="we-design-lab__grid">
          <h3 className="we-design-lab__subheading">图标按钮：边长取控件高度；危险色调悬停才露色</h3>
          {SIZES.map(([size, label]) => (
            <div key={size} className="we-design-lab__row">
              <span className="we-design-lab__count">{label}</span>
              <IconButton size={size} label="编辑" onClick={noop}><IconPencil size={ICON_PX[size]} /></IconButton>
              <IconButton size={size} variant="secondary" label="下一页" onClick={noop}><IconChevronRight size={ICON_PX[size]} /></IconButton>
              <IconButton size={size} variant="primary" label="发送" onClick={noop}><IconArrowUp size={ICON_PX[size]} /></IconButton>
              <IconButton size={size} variant="danger" label="删除" onClick={noop}><IconTrash size={ICON_PX[size]} /></IconButton>
            </div>
          ))}
        </div>

        <div className="we-design-lab__grid">
          <h3 className="we-design-lab__subheading">放在书桌上：自动换成书桌配色</h3>
          <div className="we-design-lab__desk we-on-shell we-design-lab__row">
            <Button size="sm" variant="secondary" onClick={noop}>导入</Button>
            <Button variant="ghost" onClick={noop}>导入世界卡</Button>
            <Button onClick={noop}>新建角色</Button>
          </div>
        </div>

        <div className="we-design-lab__grid">
          <h3 className="we-design-lab__subheading">压在封面图上</h3>
          <div className="we-design-lab__cover we-design-lab__row">
            <IconButton variant="overlay" size="sm" label="导出" onClick={noop}><IconDownload size={16} /></IconButton>
            <IconButton variant="overlay" size="sm" label="删除" className="is-danger" onClick={noop}><IconTrash size={16} /></IconButton>
          </div>
        </div>
      </div>
    </VisualSection>
  );
}
