const ALLOWED_SIZES = [16, 20, 24];

/**
 * Icon — SVG 图标容器 Primitive
 * Props:
 *   size      — 16 | 20 | 24（只允许三档，开发环境会 console.warn 非法值）
 *   viewBox   — SVG viewBox，默认 "0 0 24 24"
 *   aria-label — 当图标是唯一可见内容时必须提供
 *   children  — SVG path / shape 内容
 *   className — 附加类名（可选）
 * 颜色通过 currentColor 继承父元素文字色，禁止在 Icon 内部覆盖颜色。
 */
export default function Icon({ size = 16, viewBox = '0 0 24 24', 'aria-label': ariaLabel, children, className, ...rest }) {
  if (import.meta.env.DEV && !ALLOWED_SIZES.includes(size)) {
    console.warn(`Icon: size must be one of ${ALLOWED_SIZES.join(', ')}, got ${size}`);
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      role={ariaLabel ? 'img' : undefined}
      className={className}
      {...rest}
    >
      {children}
    </svg>
  );
}
