import { useState } from 'react';

// 值在组件挂载期间真的变了才返回 { from, key }：from 是变化前的值，key 每变一次递增，
// 可直接作 GlitchText 的 playKey；首次挂载（含切页签后重新挂载）返回 null，不会误播。
export function useChangeBurst(value) {
  const [seen, setSeen] = useState({ value, burst: null });
  if (!Object.is(seen.value, value)) {
    const burst = { from: seen.value, key: (seen.burst?.key ?? 0) + 1 };
    setSeen({ value, burst });
    return burst;
  }
  return seen.burst;
}
