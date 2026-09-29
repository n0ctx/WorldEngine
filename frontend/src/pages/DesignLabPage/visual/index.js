import { AccentColorsDemo, BasePaletteDemo, SurfaceColorsDemo, WashColorsDemo } from './color.jsx';
import { EntryColsDemo } from './cols.jsx';
import { ChatDemo, CardsDemo, ControlsDemo, TopbarDemo } from './component.jsx';
import { ChatControlsDemo } from './controls.jsx';
import { LoadingDemo, PageCanvasDemo, WorldCardDemo } from './page.jsx';
import { AtmosphereDemo, PanesDemo } from './shell.jsx';
import { MaterialDemo, RadiusDemo, ShadowDemo } from './shape.jsx';
import { FontsDemo, LeadingTrackingDemo, TextScaleDemo } from './type.jsx';

/** 视觉位 id → 演示组件；每个 id 必须在 visualSlots.js 里有对应的视觉位。 */
export const VISUAL_DEMOS = {
  'base-palette': BasePaletteDemo,
  'surface-colors': SurfaceColorsDemo,
  'accent-colors': AccentColorsDemo,
  'wash-colors': WashColorsDemo,
  fonts: FontsDemo,
  'text-scale': TextScaleDemo,
  'leading-tracking': LeadingTrackingDemo,
  radius: RadiusDemo,
  shadow: ShadowDemo,
  material: MaterialDemo,
  controls: ControlsDemo,
  cards: CardsDemo,
  'entry-cols': EntryColsDemo,
  'topbar-skin': TopbarDemo,
  atmosphere: AtmosphereDemo,
  panes: PanesDemo,
  'page-canvas': PageCanvasDemo,
  'world-card': WorldCardDemo,
  loading: LoadingDemo,
  chat: ChatDemo,
  'chat-controls': ChatControlsDemo,
};
