/* 世界主色「保证对比度」的两个基准，取色（extractAccentColor）与是否套用（useWorldAccentVars）共用。
 * 主色按钮的文字用的是 --we-color-bg-canvas，取色算法保证主色与 ACCENT_TEXT_BASIS_RGB 的对比度 >= 4.5:1。
 * 所以任何画布亮度低于 DARK_CANVAS_LUMINANCE_THRESHOLD 的主题（会套用世界主色）：画布都不能比这个基准更亮，
 * 否则保证不成立；由 tests/themes/theme-wiring.test.js 对每个主题核对。 */

// 略浅于夜航画布（#17130f）的近黑色，作为保守基准：亮度越接近主色，对比度越低
export const ACCENT_TEXT_BASIS_RGB = { r: 0x15, g: 0x18, b: 0x1b };

// 画布亮度低于此值才套用世界主色；浅色主题（羊皮纸）的按钮文字是亮色，取色的保证不适用
export const DARK_CANVAS_LUMINANCE_THRESHOLD = 0.35;
