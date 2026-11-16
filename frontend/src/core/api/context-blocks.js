import { request } from './request.js';

const base = (sessionId) => `/api/sessions/${sessionId}/context`;

/** 剧情摘要：在用的压缩块与上下文统计 → { blocks, stats } */
export function getContextOverview(sessionId) {
  return request(base(sessionId), {}, '读取剧情摘要失败');
}

/** 块的来源：默认展开一级（子块 + 子块没覆盖的原文）；full 时给出覆盖范围内的全部原文 → { block, children, rounds } */
export function getContextBlockSource(sessionId, blockId, { full = false } = {}) {
  return request(`${base(sessionId)}/blocks/${blockId}/source${full ? '?full=1' : ''}`, {}, '读取原文失败');
}

/** 改写一段摘要 → { block } */
export function updateContextBlock(sessionId, blockId, { summary, topic }) {
  return request(`${base(sessionId)}/blocks/${blockId}`, {
    method: 'PUT',
    body: JSON.stringify({ summary, topic }),
  }, '保存摘要失败');
}

/** 恢复原文（展开一级）→ 恢复后的 { blocks, stats } */
export function restoreContextBlock(sessionId, blockId) {
  return request(`${base(sessionId)}/blocks/${blockId}`, { method: 'DELETE' }, '恢复原文失败');
}

/** 在块摘要与原文轮次里检索 → { hits } */
export function searchContext(sessionId, query) {
  return request(`${base(sessionId)}/search?q=${encodeURIComponent(query)}`, {}, '查找失败');
}
