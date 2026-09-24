// canvas / WebGL 不认 var(--we-*)：借元素的计算色把主题 token 解析成 [r, g, b]（0–255）
export function readCssColor(el, value) {
  const probe = document.createElement('span');
  probe.style.color = value;
  probe.style.display = 'none';
  el.appendChild(probe);
  const match = getComputedStyle(probe).color.match(/[\d.]+/g);
  probe.remove();
  return match ? match.slice(0, 3).map(Number) : [0, 0, 0];
}
