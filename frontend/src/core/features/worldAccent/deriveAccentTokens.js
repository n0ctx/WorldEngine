/**
 * 把单一十六进制主色，按 nocturne/classic-parchment/neon-noir 三套主题已有的
 * accent 系 token 比例（bg 12% / border 28% / border-sm 20%，border-focus 与 accent 同色，
 * accent-deep 降低约 15% 亮度）派生出完整的一组 --we-color-accent-* 覆盖值。
 *
 * 供世界主色运行时注入使用（见 useWorldAccentVars.js）。
 */
import { hexToRgb, rgbToHex, rgbToHsl, hslToRgb, clamp } from '../../utils/color.js';

export function deriveAccentTokens(accentHex) {
  const rgb = hexToRgb(accentHex);
  if (!rgb) return null;

  const hsl = rgbToHsl(rgb);
  const deepRgb = hslToRgb({ h: hsl.h, s: hsl.s, l: clamp(hsl.l - 15, 10, 95) });
  const deepHex = rgbToHex(deepRgb);

  const { r, g, b } = rgb;
  return {
    '--we-color-accent': accentHex,
    '--we-color-accent-deep': deepHex,
    '--we-color-accent-bg': `rgba(${r}, ${g}, ${b}, 0.12)`,
    '--we-color-accent-border': `rgba(${r}, ${g}, ${b}, 0.28)`,
    '--we-color-accent-border-sm': `rgba(${r}, ${g}, ${b}, 0.20)`,
    '--we-color-border-focus': accentHex,
  };
}
