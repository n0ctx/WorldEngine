export function buildWorldTabs(worldId) {
  return [
    { key: `/worlds/${worldId}/build`, label: '构建' },
    { key: `/worlds/${worldId}`, label: '故事' },
    { key: `/worlds/${worldId}/state`, label: '状态' },
  ];
}
