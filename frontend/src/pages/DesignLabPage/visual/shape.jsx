import VisualSection from '../VisualSection.jsx';

const RADII = ['none', 'xs', 'sm', 'md', 'lg', 'xl', 'full'];
const SHADOWS = ['paper-lift', 'paper-indent', 'dialog', 'toast', 'range-thumb', 'range-thumb-active'];

export function RadiusDemo() {
  return (
    <VisualSection id="radius">
      <div className="we-design-lab__row">
        {RADII.map((name) => (
          <span key={name} className="we-design-lab__shape we-design-lab__shape--radius" style={{ '--lab-token': `var(--we-radius-${name})` }}>{name}</span>
        ))}
      </div>
    </VisualSection>
  );
}

export function ShadowDemo() {
  return (
    <VisualSection id="shadow">
      <div className="we-design-lab__row">
        {SHADOWS.map((name) => (
          <span key={name} className="we-design-lab__shape we-design-lab__shape--shadow" style={{ '--lab-token': `var(--we-shadow-${name})` }}>{name}</span>
        ))}
        <span className="we-design-lab__shape we-design-lab__shape--shadow" style={{ '--lab-token': 'var(--we-focus-ring)' }}>focus-ring</span>
      </div>
    </VisualSection>
  );
}

export function MaterialDemo() {
  return (
    <VisualSection id="material">
      <div className="we-design-lab__row">
        <div className="we-design-lab__shape we-material">material</div>
        <div className="we-design-lab__backdrop">
          <div className="we-design-lab__shape we-design-lab__glass">glass</div>
        </div>
        <div className="we-design-lab__shape we-design-lab__stage-surface">stage</div>
      </div>
    </VisualSection>
  );
}
