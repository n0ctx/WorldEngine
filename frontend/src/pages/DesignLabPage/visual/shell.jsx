import { useState } from 'react';
import AtmosphereLayer from '../../../shells/book-spread/atmosphere/AtmosphereLayer.jsx';
import ShellFrame from '../ShellFrame.jsx';
import VisualSection from '../VisualSection.jsx';

const DUST_COLORS = [
  { name: '主题默认', color: '' },
  { name: '暖金', color: '#c9a063' },
  { name: '靛蓝', color: '#7f9cff' },
  { name: '赤红', color: '#d2583c' },
];

export function AtmosphereDemo() {
  const [quiet, setQuiet] = useState(false);
  const [color, setColor] = useState('');
  return (
    <VisualSection id="atmosphere">
      <div className="we-design-lab__chips we-design-lab__chips--inline" role="group" aria-label="光尘颜色">
        {DUST_COLORS.map((item) => (
          <button
            key={item.name}
            type="button"
            className="we-design-lab__chip"
            aria-pressed={color === item.color}
            onClick={() => setColor(item.color)}
          >
            {item.name}
          </button>
        ))}
        <button type="button" className="we-design-lab__chip" aria-pressed={quiet} onClick={() => setQuiet((q) => !q)}>
          阅读页强度
        </button>
      </div>
      <div className="we-design-lab__fx-box" style={color ? { '--we-atmosphere-color': color } : undefined}>
        <AtmosphereLayer quiet={quiet} colorKey={color} />
        <p className="we-design-lab__note">光尘铺在内容后面；这里限制在盒子里，真实页面里铺满整个窗口。</p>
      </div>
    </VisualSection>
  );
}

export function PanesDemo() {
  return (
    <VisualSection id="panes">
      <ShellFrame initialLeft>
        <p className="we-design-lab__note">中栏纸面；左抽屉展开，右抽屉收成窄轨。</p>
      </ShellFrame>
      <div className="we-edit-canvas we-design-lab__canvas-strip">
        <p className="we-design-lab__note">页面画布纹理（世界列表、编辑页的底）</p>
      </div>
    </VisualSection>
  );
}
