let pixel;

// 1×1 画布：把任意 CSS 颜色画成一个像素再读回，统一换算成 sRGB；环境没有 2D 画布时返回 null
function pixelContext() {
  if (pixel === undefined) {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    pixel = canvas.getContext('2d', { willReadFrequently: true });
  }
  return pixel;
}

// canvas / WebGL 不认 var(--we-*)：借元素的计算色把主题 token 解析成 [r, g, b]（0–255）。
// 推导出的 token（color-mix）计算后是 oklab() / color() 等写法，不能直接取数字，要经画布换算
export function readCssColor(el, value) {
  const probe = document.createElement('span');
  probe.style.color = value;
  probe.style.display = 'none';
  el.appendChild(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  const ctx = pixelContext();
  if (ctx) {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return [r, g, b];
  }
  const match = color.match(/[\d.]+/g);
  return match ? match.slice(0, 3).map(Number) : [0, 0, 0];
}
