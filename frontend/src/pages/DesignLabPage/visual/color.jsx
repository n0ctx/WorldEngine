import VisualSection from '../VisualSection.jsx';
import { SwatchGroup } from './Swatches.jsx';

const BASE = [
  'paper-100', 'paper-200', 'paper-300', 'paper-400', 'ink-900', 'ink-700', 'ink-500',
  'vermilion-600', 'vermilion-800', 'gold-600', 'gold-400', 'moss-600', 'amber-600', 'slate-600',
  'book-bg', 'white', 'peach-200',
];

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
        <SwatchGroup title="底色" prefix="--we-color-" names={['bg-canvas', 'bg-surface', 'bg-elevated', 'bg-subtle', 'bg-muted', 'bg-overlay', 'bg-inverse']} />
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
        <SwatchGroup title="强调" prefix="--we-color-" names={['accent', 'accent-deep', 'accent-bg', 'accent-border', 'accent-border-sm', 'gold', 'gold-pale']} />
        <SwatchGroup title="状态" prefix="--we-color-" names={['status-success', 'status-warning', 'status-danger', 'status-info']} />
      </div>
    </VisualSection>
  );
}

export function WashColorsDemo() {
  return (
    <VisualSection id="wash-colors">
      <div className="we-design-lab__grid">
        <SwatchGroup title="墨色透明层" prefix="--we-color-" names={['ink-wash', 'ink-wash-md', 'ink-wash-strong', 'ink-secondary-wash', 'ink-secondary-wash-sm']} />
        <SwatchGroup title="投影与遮罩" prefix="--we-color-" names={['shadow-sm', 'shadow-md', 'shadow-lg', 'shadow-xl', 'overlay-medium', 'overlay-heavy']} />
        <SwatchGroup title="纸面与高光" prefix="--we-color-" names={['paper-wash', 'paper-tint', 'paper-overlay', 'white-wash', 'white-sheen-sm', 'white-sheen-md']} />
        <SwatchGroup title="头像占位" prefix="--we-color-" names={['avatar-placeholder', 'avatar-text']} />
      </div>
    </VisualSection>
  );
}
