export async function fetchSessionTimeline(sessionId) {
  const res = await fetch(`/api/sessions/${sessionId}/timeline`);
  if (!res.ok) throw new Error('获取时间线失败');
  const data = await res.json();
  return data.items ?? [];
}
