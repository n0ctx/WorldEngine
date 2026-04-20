/**
 * assertExists — 统一 404 检查工具
 * 返回 false 表示已响应 404，调用方应立即 return。
 */
export function assertExists(res, resource, message = '资源不存在') {
  if (!resource) {
    res.status(404).json({ error: message });
    return false;
  }
  return true;
}
