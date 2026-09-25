/**
 * 共享 fetch 封装
 *
 * 所有后端 API 调用的统一 HTTP 请求工具，包含：
 * - Content-Type 默认 application/json
 * - 4xx/5xx 自动抛出错误（优先读 body.error，否则为「failMessage：状态码」）
 * - 204 No Content 返回 null
 */
export async function request(url, options = {}, failMessage = '请求失败') {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  return readJsonResponse(res, failMessage);
}

/** POST multipart 表单；不设 Content-Type，由浏览器补上 boundary */
export async function uploadForm(url, formData) {
  const res = await fetch(url, { method: 'POST', body: formData });
  return readJsonResponse(res, '上传失败');
}

/** 4xx/5xx 时抛错：优先 body.error，否则为「failMessage：状态码」 */
export async function assertOk(res, failMessage = '请求失败') {
  if (res.ok) return;
  const body = await res.json().catch(() => ({}));
  throw new Error(body.error || `${failMessage}：${res.status}`);
}

async function readJsonResponse(res, failMessage) {
  await assertOk(res, failMessage);
  if (res.status === 204) return null;
  return res.json();
}
