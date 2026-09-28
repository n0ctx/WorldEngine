import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchStateMemory, fetchStateMemorySchema } from '../api/state-memory.js';
import { useEntityDiff } from './useEntityDiff.js';

/**
 * 拉取会话的状态记忆聚合视图（实体 / 关系 / 事项 / 在场名单）。
 * sessionId 或 tick 变化时重新拉取；reload() 供编辑后手动刷新，setData 供本地乐观更新。
 */
export function useStateMemory(sessionId, tick) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const requestSeqRef = useRef(0);

  const reload = useCallback(() => {
    if (!sessionId) return;
    const seq = (requestSeqRef.current += 1);
    // 用微任务把 setLoading(true) 挪出同步执行路径：直接在 effect 里同步调用会触发
    // react-hooks/set-state-in-effect（参照 useSessionState.js 的 Promise.resolve().then() 写法）
    Promise.resolve().then(() => {
      if (requestSeqRef.current === seq) setLoading(true);
    });
    fetchStateMemory(sessionId)
      .then((res) => {
        if (requestSeqRef.current !== seq) return;
        setError('');
        setData(res);
      })
      .catch((err) => {
        if (requestSeqRef.current !== seq) return;
        setError(err.message || '加载失败');
      })
      .finally(() => {
        if (requestSeqRef.current !== seq) return;
        setLoading(false);
      });
  }, [sessionId]);

  useEffect(() => { reload(); }, [reload, tick]);

  return { data, error, loading, reload, setData };
}

// schema 全局只拉一次并缓存；请求失败时清空缓存以便下次重试
let schemaRequest = null;

export function useStateMemorySchema() {
  const [schema, setSchema] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (!schemaRequest) schemaRequest = fetchStateMemorySchema();
    schemaRequest
      .then((res) => { if (!cancelled) setSchema(res); })
      .catch((err) => {
        schemaRequest = null;
        if (!cancelled) setError(err.message || '加载失败');
      });
    return () => { cancelled = true; };
  }, []);

  return { schema, error };
}

/**
 * 状态栏面板（对话 StatePanel、写作 NearbyPanel）共用的状态记忆数据：聚合视图、schema 与本轮实体变化，
 * 每个面板只拉取一次，再分发给 SessionStatePanel 与 NPC 页签。
 */
export function useStateMemoryPanelData(sessionId, tick) {
  const { data, error, loading, reload } = useStateMemory(sessionId, tick);
  const { schema } = useStateMemorySchema();
  const entityDiff = useEntityDiff(data?.entities, sessionId);
  return { stateMemory: data, stateMemoryError: error, stateMemoryLoading: loading, reloadStateMemory: reload, stateMemorySchema: schema, entityDiff };
}
