/**
 * 共享 fetch 封装
 *
 * 所有后端 API 调用的统一 HTTP 请求工具，包含：
 * - Content-Type 默认 application/json
 * - 4xx/5xx 自动抛出错误（优先读 body.error）
 * - 204 No Content 返回 null
 */
export async function request(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `请求失败：${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}
