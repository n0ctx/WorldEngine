/**
 * 「封面即光源」运行时注入：解析当前是否处于某个世界内（世界层/规则空间/会话页/写作页），
 * 是则取该世界的 accent_color 派生出 --we-color-accent 系 token 覆盖值；
 * 书架层（'/'）或没有 accent_color 的世界返回 null，调用方不注入任何 style，
 * 页面退回主题自身默认色。
 *
 * 只在画布偏深色的主题下生效（见 shouldApplyWorldAccent），原因见任务报告第 7 条：
 * 主色按钮的文字用的是 --we-color-bg-canvas，深色主题（nocturne/neon-noir）该值接近黑，
 * 取色算法专为"浅色块 + 近黑文字对比度 >=4.5:1"校验过；羊皮纸系浅色主题画布本身很亮，
 * 按钮文字也是亮色，同一批世界主色不保证在那边仍达标，所以浅色主题下不覆盖，只用主题自带色。
 */
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { getWorld } from '../../api/worlds.js';
import useStore from '../../state/index.js';
import { extractIds, resolveTopbarPathname, isBookshelfPathname } from '../../utils/worldScope.js';
import { deriveAccentTokens } from './deriveAccentTokens.js';
import { relativeLuminance } from '../../utils/color.js';

const DARK_CANVAS_LUMINANCE_THRESHOLD = 0.35;

function parseCssColor(value) {
  const m = value.trim().match(/^#([0-9a-f]{6})$/i);
  if (!m) return null;
  const num = parseInt(m[1], 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

/**
 * 当前主题画布是否够暗，暗到可以安全套用世界主色（见文件头注释的判断依据）。
 */
function shouldApplyWorldAccent() {
  if (typeof document === 'undefined') return false;
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--we-color-bg-canvas');
  const rgb = parseCssColor(raw);
  if (!rgb) return true; // 取不到画布色时不阻断功能，按可注入处理
  return relativeLuminance(rgb) < DARK_CANVAS_LUMINANCE_THRESHOLD;
}

function useScopedWorldId() {
  const location = useLocation();
  const pathname = resolveTopbarPathname(location);
  const { worldId } = extractIds(pathname);
  const currentWorldId = useStore((s) => s.currentWorldId);
  if (isBookshelfPathname(pathname)) return null;
  return worldId ?? currentWorldId ?? null;
}

/**
 * 返回可直接铺进 style={{...}} 的 CSS 变量对象；不在世界内 / 无主色 / 浅色主题下返回 null。
 */
export function useWorldAccentVars() {
  const worldId = useScopedWorldId();
  // 记录"这份 accentColor 是为哪个 worldId 取到的"，而不是只存颜色本身——
  // worldId 变化后、getWorld() 返回前的这段时间里，靠渲染期比对
  // fetchedFor !== worldId 就能立即判定"这份色已经过期"，退回中性色；
  // 不需要在 effect 里同步调用 setState(null) 去清空（那样会触发一次多余的
  // 级联渲染，也是 react-hooks/set-state-in-effect 明确不建议的写法）。
  // 宁可短暂用主题默认色，也不要显示错误世界的颜色（缺陷三）。
  const [accentState, setAccentState] = useState({ fetchedFor: null, color: null });
  // shouldApplyWorldAccent() 读的是主题包异步注入的 <style id="we-theme-css">，
  // 和世界数据的 fetch 是两条独立的异步链路：主题 CSS 还没注入完时若只在渲染期同步
  // 读一次（不进 state），之后主题就绪也不会触发这个 hook 重渲染，会永久卡在"判定为浅色
  // 主题、不注入"的错误结果上（复现：整页刷新时世界数据经常比主题 CSS 先到）。
  // 用 state 存开关值 + 监听 we:theme-updated（themes.js 里 refreshThemeCss 成功后派发）
  // 保证主题就绪后能补一次重渲染。
  const [themeReady, setThemeReady] = useState(shouldApplyWorldAccent);

  useEffect(() => {
    if (!worldId) return undefined;
    let cancelled = false;
    getWorld(worldId)
      .then((w) => { if (!cancelled) setAccentState({ fetchedFor: worldId, color: w?.accent_color ?? null }); })
      .catch(() => { if (!cancelled) setAccentState({ fetchedFor: worldId, color: null }); });
    return () => { cancelled = true; };
  }, [worldId]);

  // 封面/主色变化（编辑页保存后）后重取
  useEffect(() => {
    if (!worldId) return undefined;
    const handler = () => {
      getWorld(worldId)
        .then((w) => setAccentState({ fetchedFor: worldId, color: w?.accent_color ?? null }))
        .catch(() => {});
    };
    window.addEventListener('we:world-updated', handler);
    return () => window.removeEventListener('we:world-updated', handler);
  }, [worldId]);

  useEffect(() => {
    const recheck = () => setThemeReady(shouldApplyWorldAccent());
    recheck(); // 主题 CSS 可能在这个 effect 挂载前就已就绪，先补一次
    window.addEventListener('we:theme-updated', recheck);
    return () => window.removeEventListener('we:theme-updated', recheck);
  }, []);

  // 没有 worldId（书架层/浮层）时直接判定为中性，不看上一个世界残留的 accentColor 状态——
  // 避免"世界A→书架"瞬间还短暂顶着 A 的颜色（effect 异步，state 还没来得及清）。
  if (!worldId) return null;
  // fetchedFor 与当前 worldId 不一致：上一个世界的颜色还没被新世界的结果覆盖，视为未就绪。
  if (accentState.fetchedFor !== worldId) return null;
  if (!accentState.color) return null;
  if (!themeReady) return null;
  return deriveAccentTokens(accentState.color);
}
