/**
 * 「封面即光源」取色：从世界封面图提取主色，压低饱和度、保证与深色底文字的对比度后
 * 得到可直接用作 --we-color-accent 的十六进制色。
 *
 * 取色放在前端（canvas 采样）：后端没有图像处理依赖，且本项目所有上传/导入路径
 * （封面直传、世界卡导入）都经过浏览器，浏览器侧已能拿到完整图片字节（File 或
 * base64 dataURL），无需给后端加图像库。
 */
import {
  rgbToHsl, hslToRgb, rgbToHex, contrastRatio, clamp,
} from './color.js';

// 兜底色：中性、低饱和、深色底可读；封面缺失/取色失败/极端封面（纯黑白灰、无法辨别色相）时使用。
// 与 nocturne 主题自身默认 accent 同色系 —— 取色失败时观感上是"退回主题默认"而非突兀色块。
export const FALLBACK_ACCENT_HEX = '#7f95a8';

const ACHROMATIC_CHROMA = 12;      // 通道极差（0-255）低于此视为无有效色相（绝对量，抗极暗/极亮失真）
const ACHROMATIC_SATURATION = 6;   // 原始饱和度低于此视为无有效色相（黑/白/灰封面）
const TARGET_SATURATION = 32;      // 压低后的饱和度上限（全站只此一处彩色，不能盖过封面本身）
const MIN_LIGHTNESS = 38;
const MAX_LIGHTNESS = 78;
const START_LIGHTNESS_MIN = 42;
const START_LIGHTNESS_MAX = 62;

function quantizeKey(r, g, b, levels) {
  const step = 256 / levels;
  return ((r / step) | 0) * levels * levels + ((g / step) | 0) * levels + ((b / step) | 0);
}

// 像素级预筛：剔除不承载"这张图的色彩印象"的像素，只留下会被人眼当作主色的那部分。
// - 极暗/极亮：阴影死黑、高光死白，本质是曝光而非颜色。
// - 彩度极低：雾霾感的灰背景，任何颜色在低饱和度下堆量都会赢，但视觉上不构成"主色"。
const PIXEL_MIN_LIGHTNESS = 15;
const PIXEL_MAX_LIGHTNESS = 90;
const PIXEL_MIN_CHROMA = 18;
// 预筛后剩余像素占比低于此值，视为"这张图确实几乎无彩"（纯黑白/雾霾照片），交给上层兜底，
// 而不是矮子里拔将军选一个噪点色。
const MIN_QUALIFIED_RATIO = 0.02;

/**
 * 从像素数组（RGBA，Uint8ClampedArray 或普通 array-like）里按「频率 × 彩度」加权选出
 * 主导量化色桶的均值颜色。
 *
 * 直接选「出现频率最高的桶」回答的是"这张图的底色是什么"——大面积暗部/雾霾背景必然
 * 赢，但那不是这张图给人的色彩印象。改成按每个桶「像素数 × 彩度」加权后取最高分的桶，
 * 回答的是"这张图给人的色彩印象是什么"：暗部/灰背景先在像素级被剔除（见
 * PIXEL_MIN_LIGHTNESS/MAX_LIGHTNESS/MIN_CHROMA），剩下候选像素里，同样出现频率下更鲜艳的
 * 颜色获得更高权重，出现频率相近时更鲜艳的那个会反超。
 *
 * 忽略近透明像素（alpha < 64）。空输入 / 全透明输入 / 预筛后剩余像素占比过低（几乎无彩的
 * 黑白灰封面）均返回 null，由调用方（computeAccentColor）落到兜底色。
 */
export function quantizeDominantColor(pixels, { levels = 8 } = {}) {
  const buckets = new Map();
  let totalValid = 0;
  let qualified = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const a = pixels[i + 3];
    if (a < 64) continue;
    totalValid += 1;
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const chroma = max - min;
    const lightness = ((max + min) / 2 / 255) * 100;
    if (lightness < PIXEL_MIN_LIGHTNESS || lightness > PIXEL_MAX_LIGHTNESS) continue;
    if (chroma < PIXEL_MIN_CHROMA) continue;
    qualified += 1;
    const key = quantizeKey(r, g, b, levels);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { count: 0, r: 0, g: 0, b: 0, chromaSum: 0 };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    bucket.chromaSum += chroma;
  }
  if (totalValid === 0) return null;
  if (qualified / totalValid < MIN_QUALIFIED_RATIO) return null;

  let best = null;
  let bestWeight = -1;
  for (const bucket of buckets.values()) {
    // weight = 像素数 × 该桶彩度均值 == chromaSum（两者等价，chromaSum 已经是逐像素彩度之和）
    const weight = bucket.chromaSum;
    if (weight > bestWeight) {
      bestWeight = weight;
      best = bucket;
    }
  }
  if (!best) return null;
  return {
    r: Math.round(best.r / best.count),
    g: Math.round(best.g / best.count),
    b: Math.round(best.b / best.count),
  };
}

// 主色按钮文字实际用的是 --we-color-bg-canvas（见 we-btn-primary 的 `color: var(--we-color-bg-canvas)`），
// 不是纯黑。这里取两个深色主题画布色里"更浅"的那个（nocturne #15181b）做校验基准 ——
// 亮度越接近背景，对比度越低，用更浅的当基准才是保守方向；曾经错用纯黑（亮度 0）做基准，
// 而纯黑是两者中"最难达标"方向被算反了的极端值，会让实际对比度不足 4.5:1 的颜色也判定通过
// （回归：西幻异世界取到 #6172ae，对 #15181b 实测只有 3.84:1，却因为对纯黑算出 4.5+ 而被放行）。
const DARK_THEME_TEXT_RGB = { r: 0x15, g: 0x18, b: 0x1b };

/**
 * 不断抬高 HSL 亮度，直到与深色主题按钮文字色（DARK_THEME_TEXT_RGB）的对比度 >= 4.5:1。
 * 触顶（MAX_LIGHTNESS）仍不达标则返回 null，由调用方落到兜底色。
 */
function ensureContrastAgainstDarkText(hsl) {
  let l = hsl.l;
  for (let i = 0; i < 60; i++) {
    const rgb = hslToRgb({ ...hsl, l });
    const ratio = contrastRatio(rgb, DARK_THEME_TEXT_RGB);
    if (ratio >= 4.5) return rgbToHex(rgb);
    l += 1;
    if (l > MAX_LIGHTNESS) return null;
  }
  return null;
}

/**
 * 输入采样得到的主导 rgb，输出「压低饱和度 + 保证对比度」后的十六进制主色。
 *
 * 兜底分支：
 *  - dominantRgb 为 null（没有可用像素）→ 兜底色
 *  - 原始饱和度过低（黑/白/灰封面，无有效色相）→ 兜底色
 *  - 压低饱和度、抬高亮度后仍无法达到 4.5:1 对比度 → 兜底色
 */
export function computeAccentColor(dominantRgb) {
  if (!dominantRgb) return FALLBACK_ACCENT_HEX;
  // 先用绝对色度（max-min 通道差）判断"有没有色相"，而不是只看 HSL 饱和度：
  // 饱和度是相对亮度归一化的，极暗/极亮的灰阶像素（如 (5,5,6)）哪怕视觉上纯黑，
  // 分母趋近 0 也会把 s 算出一个虚高的百分比，单靠 s 阈值挡不住这类极端封面。
  const { r, g, b } = dominantRgb;
  const chroma = Math.max(r, g, b) - Math.min(r, g, b);
  if (chroma < ACHROMATIC_CHROMA) return FALLBACK_ACCENT_HEX;

  const hsl = rgbToHsl(dominantRgb);
  if (hsl.s < ACHROMATIC_SATURATION) return FALLBACK_ACCENT_HEX;

  const startLightness = clamp(hsl.l, START_LIGHTNESS_MIN, START_LIGHTNESS_MAX);
  const desaturated = {
    h: hsl.h,
    s: Math.min(hsl.s, TARGET_SATURATION),
    l: clamp(startLightness, MIN_LIGHTNESS, MAX_LIGHTNESS),
  };

  return ensureContrastAgainstDarkText(desaturated) ?? FALLBACK_ACCENT_HEX;
}

const THUMBNAIL_SIZE = 48; // 缩到很小再采样：视觉上主色不受影响，成本降一个数量级

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = src;
  });
}

/**
 * 从图片 src（blob:/data:/http(s) URL）提取主色，返回十六进制颜色字符串。
 * 内部把图片缩到 48x48 再采样，失败（加载失败、canvas 不可用等）时返回兜底色而不抛出——
 * 取色失败不应阻断封面上传/世界卡导入本身。
 */
export async function extractAccentColorFromImageSrc(src) {
  try {
    const img = await loadImage(src);
    const canvas = document.createElement('canvas');
    canvas.width = THUMBNAIL_SIZE;
    canvas.height = THUMBNAIL_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return FALLBACK_ACCENT_HEX;
    ctx.drawImage(img, 0, 0, THUMBNAIL_SIZE, THUMBNAIL_SIZE);
    const { data } = ctx.getImageData(0, 0, THUMBNAIL_SIZE, THUMBNAIL_SIZE);
    return computeAccentColor(quantizeDominantColor(data));
  } catch {
    return FALLBACK_ACCENT_HEX;
  }
}

/**
 * 从 File（封面直传场景）提取主色。
 */
export async function extractAccentColorFromFile(file) {
  const url = URL.createObjectURL(file);
  try {
    return await extractAccentColorFromImageSrc(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}
