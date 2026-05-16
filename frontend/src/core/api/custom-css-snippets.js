import { request } from './request.js';

const BASE = '/api/custom-css-snippets';

export function listSnippets({ mode } = {}) {
  const params = new URLSearchParams();
  if (mode) params.set('mode', mode);
  const query = params.toString() ? `?${params}` : '';
  return request(`${BASE}${query}`);
}

export function createSnippet(data) {
  return request(BASE, { method: 'POST', body: JSON.stringify(data) });
}

export function updateSnippet(id, patch) {
  return request(`${BASE}/${id}`, { method: 'PUT', body: JSON.stringify(patch) });
}

export function deleteSnippet(id) {
  return request(`${BASE}/${id}`, { method: 'DELETE' });
}

export function reorderSnippets(items) {
  return request(`${BASE}/reorder`, { method: 'PUT', body: JSON.stringify({ items }) });
}

/**
 * 拉取指定 mode 的启用片段，按 sort_order 拼接后写入 <style id="we-custom-css">
 * @param {'chat'|'writing'} [mode] 不传则加载全部
 */
// 单调递增的序号，确保 mode 快速切换时只有最新一次 refreshCustomCss 的结果
// 落入 <style id="we-custom-css">，避免旧请求晚返回时覆盖当前 mode 的样式。
let _cssRefreshSeq = 0;

export async function refreshCustomCss(mode) {
  const seq = ++_cssRefreshSeq;
  try {
    const snippets = await listSnippets(mode ? { mode } : {});
    if (seq !== _cssRefreshSeq) return; // 已被后续请求作废
    const css = snippets
      .filter((s) => s.enabled)
      .map((s) => s.content)
      .join('\n');
    let el = document.getElementById('we-custom-css');
    if (!el) {
      el = document.createElement('style');
      el.id = 'we-custom-css';
      document.head.appendChild(el);
    }
    el.textContent = css;
  } catch {
    // 静默失败，不影响主功能
  }
}
