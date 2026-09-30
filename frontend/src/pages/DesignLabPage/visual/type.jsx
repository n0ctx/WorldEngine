import VisualSection from '../VisualSection.jsx';

const FONTS = [
  { token: '--we-font-display', label: '展示字体', sample: '无限轮回 · 第三章' },
  { token: '--we-font-prose', label: '叙事字体', sample: '雨从傍晚一直下到后半夜，你推开拳场的铁门。' },
  { token: '--we-font-ui', label: '界面字体', sample: '世界规则 · 状态字段 · 开场白 Aa 123' },
  { token: '--we-font-mono', label: '等宽字体', sample: '{ "severity": "medium" }' },
];
const ROLES = [
  { id: 'display', use: '世界名、页面大标题', sample: '无限轮回' },
  { id: 'title', use: '编辑页、设置、工坊标题', sample: '编辑世界' },
  { id: 'heading', use: '世界卡名、确认框、设置分节', sample: '雨夜里的拳场' },
  { id: 'subheading', use: '对话框标题、说话人、字段标题', sample: '条目编辑 · Speaker' },
  { id: 'prose', use: '叙事正文、写作正文、聊天输入', sample: '雨从傍晚一直下到后半夜。你推开拳场的铁门，潮气和汗味一起涌出来。' },
  { id: 'body', use: '多行说明、提示、输入框', sample: '对话结束后整理要点，下次开场时带上。超过预算时，先丢弃最早的内容。' },
  { id: 'ui', use: '按钮、下拉、导航、列表条目', sample: '保存 · 恢复默认 · 世界规则 Settings' },
  { id: 'caption', use: '徽标、tag、时间、元信息', sample: '3 分钟前 · 12 条消息 · v1.4.2' },
  { id: 'eyebrow', use: '分节标签、表头', sample: '世界规则 STATUS' },
];

export function FontsDemo() {
  return (
    <VisualSection id="fonts">
      <div className="we-design-lab__grid">
        {FONTS.map((font) => (
          <div key={font.token}>
            <h3 className="we-design-lab__subheading">{font.label}</h3>
            <p className="we-design-lab__type-sample" style={{ '--lab-token': `var(${font.token})` }}>{font.sample}</p>
          </div>
        ))}
      </div>
    </VisualSection>
  );
}

export function TypeRolesDemo() {
  return (
    <VisualSection id="type-roles">
      {ROLES.map((role) => (
        <div key={role.id} className="we-design-lab__type-role">
          <p className="we-design-lab__swatch-name">
            {role.id}
            <span className="we-design-lab__type-role-use">{role.use}</span>
          </p>
          <p className={`we-design-lab__type-role-sample we-type-${role.id}`}>{role.sample}</p>
        </div>
      ))}
    </VisualSection>
  );
}
