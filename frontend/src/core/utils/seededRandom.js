/** 按一段文字取稳定的随机序列：同样的文字永远得到同一串数，世界名生成场景画用它。 */

// FNV-1a：把名字压成 32 位种子
export function hashString(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// mulberry32：由种子得到可复现的 [0,1) 序列
export function seededRandom(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function round(n) {
  return Math.round(n * 10) / 10;
}

export function between(rand, min, max) {
  return min + rand() * (max - min);
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
