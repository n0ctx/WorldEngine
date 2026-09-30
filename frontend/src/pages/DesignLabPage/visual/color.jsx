import VisualSection from '../VisualSection.jsx';
import { SwatchGroup } from './Swatches.jsx';

const BASE = ['canvas', 'surface', 'ink', 'accent', 'success', 'warning', 'info', 'danger', 'shade'];

export function BasePaletteDemo() {
  return (
    <VisualSection id="base-palette">
      <SwatchGroup title="基础色" prefix="--we-base-" names={BASE} />
    </VisualSection>
  );
}

export function SurfaceColorsDemo() {
  return (
    <VisualSection id="surface-colors">
      <div className="we-design-lab__grid">
        <SwatchGroup title="底色" prefix="--we-color-" names={['bg-canvas', 'bg-surface', 'bg-elevated', 'bg-subtle', 'bg-muted', 'bg-overlay']} />
        <SwatchGroup title="文字" prefix="--we-color-" names={['text-primary', 'text-secondary', 'text-tertiary', 'text-inverse', 'text-danger']} />
        <SwatchGroup title="边框" prefix="--we-color-" names={['border-subtle', 'border-default', 'border-strong', 'border-focus']} />
      </div>
    </VisualSection>
  );
}

export function AccentColorsDemo() {
  return (
    <VisualSection id="accent-colors">
      <div className="we-design-lab__grid">
        <SwatchGroup title="强调" prefix="--we-color-" names={['accent', 'accent-deep', 'accent-bg', 'accent-border', 'ornament', 'gold-pale']} />
        <SwatchGroup title="状态" prefix="--we-color-" names={['status-success', 'status-warning', 'status-danger', 'status-info']} />
      </div>
    </VisualSection>
  );
}

export function WashColorsDemo() {
  return (
    <VisualSection id="wash-colors">
      <div className="we-design-lab__grid">
        <SwatchGroup title="墨色状态层" prefix="--we-color-" names={['pressed']} />
        <SwatchGroup title="阴影与凹陷" prefix="--we-color-" names={['shade-1', 'shade-2', 'shade-3', 'shade-4']} />
        <SwatchGroup title="高光" prefix="--we-color-" names={['highlight-1', 'highlight-2']} />
        <SwatchGroup title="恒定纯白与封面黑" prefix="--we-color-" names={['white', 'cover-scrim']} />
        <SwatchGroup title="头像占位" prefix="--we-color-" names={['avatar-text']} />
      </div>
    </VisualSection>
  );
}
