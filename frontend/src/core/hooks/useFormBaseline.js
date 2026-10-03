import { useCallback, useRef, useState } from 'react';

/**
 * 编辑表单的基准：最近一次与服务端一致的表单值，用来判断是否有未保存修改。
 * values 是当前表单值（与基准同键）；基准为 null（还没加载）时不算有修改。
 * baselineRef 供取数、保存的异步回调读最新基准。
 */
export function useFormBaseline(values) {
  const [saved, setSaved] = useState(null);
  const baselineRef = useRef(null);
  const setBaseline = useCallback((next) => {
    baselineRef.current = next;
    setSaved(next);
  }, []);
  const dirty = !!saved && Object.keys(saved).some((k) => values[k] !== saved[k]);
  return { dirty, baselineRef, setBaseline };
}

/**
 * 换基准时的逐字段合并，返回给 setState 用的更新函数：
 * 当前值已不同于 base[key]（用户在这之后改过）就保留当前输入，否则换成 next[key]。
 * base 为 null（首次加载）时一律取 next。
 * 用于重新取数（base 是上一份基准）和保存成功（base 是提交时的表单值），避免冲掉这期间的输入。
 */
export function keepEdited(base, key, next) {
  return (current) => (base && current !== base[key] ? current : next[key]);
}
