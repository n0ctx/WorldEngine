import VisualSection from '../VisualSection.jsx';

const FONTS = [
  { token: '--we-font-display', label: '展示字体', sample: '无限轮回 · 第三章' },
  { token: '--we-font-prose', label: '叙事字体', sample: '雨从傍晚一直下到后半夜，你推开拳场的铁门。' },
  { token: '--we-font-ui', label: '界面字体', sample: '世界规则 · 状态字段 · 开场白 Aa 123' },
  { token: '--we-font-mono', label: '等宽字体', sample: '{ "severity": "medium" }' },
];
const SIZES = ['hero', 'xl', 'lg', 'md', 'base', 'prose', 'control', 'body', 'sm', '2xs', 'xs'];
const LEADINGS = ['flush', 'tight', 'snug', 'relaxed', 'normal', 'loose', 'prose'];
const TRACKINGS = ['tight', 'normal', 'wide', 'roomy', 'wider', 'caps', 'airy', 'display'];
const PARAGRAPH = '雨从傍晚一直下到后半夜。你推开拳场的铁门，潮气和汗味一起涌出来，灯泡在头顶晃。';

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

export function TextScaleDemo() {
  return (
    <VisualSection id="text-scale">
      {SIZES.map((size) => (
        <p key={size} className="we-design-lab__type-step" style={{ '--lab-token': `var(--we-text-${size})` }}>
          {size} · 墨在水中
        </p>
      ))}
    </VisualSection>
  );
}

export function LeadingTrackingDemo() {
  return (
    <VisualSection id="leading-tracking">
      <div className="we-design-lab__grid">
        <div>
          <h3 className="we-design-lab__subheading">行高</h3>
          <div className="we-design-lab__samples">
            {LEADINGS.map((name) => (
              <p key={name} className="we-design-lab__leading-sample" style={{ '--lab-token': `var(--we-leading-${name})` }}>
                <span className="we-design-lab__swatch-name">{name}</span>
                {PARAGRAPH}
              </p>
            ))}
          </div>
        </div>
        <div>
          <h3 className="we-design-lab__subheading">字距</h3>
          {TRACKINGS.map((name) => (
            <p key={name} className="we-design-lab__tracking-sample" style={{ '--lab-token': `var(--we-tracking-${name})` }}>
              <span className="we-design-lab__swatch-name">{name}</span>
              WorldEngine 世界引擎
            </p>
          ))}
        </div>
      </div>
    </VisualSection>
  );
}
