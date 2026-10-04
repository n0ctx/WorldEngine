import { useEffect, useState } from 'react';
import PortalShards from '../../../components/motion/PortalShards.jsx';
import SlugText from '../../../components/motion/SlugText.jsx';
import { shatterCard } from '../../../components/motion/shatter.js';
import Button from '../../../components/ui/Button.jsx';
import SectionTitle from '../../../components/ui/SectionTitle.jsx';
import { useMotion } from '../../../core/hooks/useMotion.js';
import SlotSection from '../SlotSection.jsx';

const CAST = ['沈聿', '顾老板', '白医生'];

/**
 * 「进入世界」转场的正式演示：类名（we-worlds-canvas / we-characters-canvas / we-portal-veil）
 * 与 data-portal 都是生产实现，页面内容是缩微样机；时序读当前动效包的 portal 字段。
 * 拆版（traits.shatter）的碎块同样由 shatterCard 切、PortalShards 挂在遮罩里。
 * 点击样机里的世界卡播放转场，「返回世界列表」复位后可再播。
 */
export function WorldPortalDemo() {
  const m = useMotion();
  const timing = m.portal();
  // worlds → transit（旧页退出 + 遮罩）→ entering（新页入场 + 遮罩）→ hub（收定）
  const [phase, setPhase] = useState('worlds');
  const [shards, setShards] = useState(null);

  useEffect(() => {
    if (phase === 'transit') {
      // timing 为 null（减少动态效果）时立即换页；handleEnter 里已分流，这里是播放途中切换的兜底
      const timer = setTimeout(() => setPhase('entering'), (timing?.navigate ?? 0) * 1000);
      return () => clearTimeout(timer);
    }
    if (phase === 'entering') {
      const remain = timing ? Math.max(timing.total - timing.navigate, 0) : 0;
      const timer = setTimeout(() => setPhase('hub'), remain * 1000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [phase, timing]);

  function handleEnter(event) {
    if (!timing) {
      setPhase('hub');
      return;
    }
    setShards(m.pack.traits.shatter ? shatterCard(event.currentTarget, event) : null);
    setPhase('transit');
  }

  const inTransit = phase === 'transit' || phase === 'entering';

  return (
    <SlotSection
      id="world-portal"
      actions={<Button variant="secondary" size="sm" onClick={() => setPhase('worlds')}>重播</Button>}
    >
      <div className="we-design-lab__portal-stage">
        {(phase === 'worlds' || phase === 'transit') && (
          <div
            className="we-worlds-canvas we-design-lab__portal-page"
            data-portal={phase === 'transit' ? 'leave' : undefined}
          >
            <p className="we-design-lab__portal-head we-worlds-header">世界</p>
            <div className="we-design-lab__portal-grid">
              <button
                type="button"
                className="we-design-lab__portal-card"
                data-portal-source={phase === 'transit' || undefined}
                onClick={handleEnter}
              >
                <span><SlugText text="雨夜拳场" /></span>
                <span className="we-design-lab__portal-hint">点击进入</span>
              </button>
              <span className="we-design-lab__portal-card we-design-lab__portal-card--idle" aria-hidden="true">雪国列车</span>
            </div>
          </div>
        )}
        {inTransit && (
          <div className="we-portal-veil" aria-hidden="true">
            {shards ? <PortalShards shards={shards} /> : null}
          </div>
        )}
        {(phase === 'entering' || phase === 'hub') && (
          <div
            className="we-characters-canvas we-design-lab__portal-page"
            data-portal={phase === 'entering' ? 'enter' : undefined}
          >
            <div className="we-worldhub-layout">
              <div className="we-design-lab__portal-col">
                <SectionTitle level="eyebrow" className="we-worldhub-section-header we-on-shell">故事线</SectionTitle>
                <span className="we-design-lab__portal-item">地下拳场的雨夜</span>
                <span className="we-design-lab__portal-item">码头欠条</span>
              </div>
              <div className="we-design-lab__portal-col">
                <SectionTitle level="eyebrow" className="we-worldhub-section-header we-on-shell">角色</SectionTitle>
                {CAST.map((name) => <span key={name} className="we-design-lab__portal-item">{name}</span>)}
              </div>
              <div className="we-design-lab__portal-col">
                <SectionTitle level="eyebrow" className="we-worldhub-section-header we-on-shell">我扮演</SectionTitle>
                <span className="we-design-lab__portal-item">拳手</span>
              </div>
            </div>
            <button type="button" className="we-design-lab__portal-back" onClick={() => setPhase('worlds')}>返回世界列表</button>
          </div>
        )}
      </div>
    </SlotSection>
  );
}
