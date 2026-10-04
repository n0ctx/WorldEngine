import { useMotion } from '../../core/hooks/useMotion.js';

/**
 * 拆版用的字：traits.shatter 的包把一段字拆成一颗颗铅字（.we-slug-char，--i 是第几颗），
 * 悬停时逐颗弹起、进入世界时逐颗崩出去（shatter.js）；其他包原样输出文字。
 */
export default function SlugText({ text }) {
  const { pack } = useMotion();
  if (!pack.traits.shatter) return text;
  // 字里可能有重复的字，位置就是身份
  return [...text].map((ch, i) => (
    <span key={`${i}-${ch}`} className="we-slug-char" style={{ '--i': i }}>{ch}</span>
  ));
}
