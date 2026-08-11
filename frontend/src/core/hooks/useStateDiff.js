import { useLayoutEffect, useRef, useState } from 'react';
import { stateRowKey } from '../../components/state/state-value-format.js';

const EMPTY = { world: [], persona: [], character: [] };
const EMPTY_RESULT = { diff: EMPTY, ready: false };

function diffSection(prevRows, nextRows) {
  if (!Array.isArray(prevRows) || !Array.isArray(nextRows)) return [];
  const prevMap = new Map(prevRows.map((r) => [stateRowKey(r), r]));
  const changes = [];
  for (const row of nextRows) {
    const prevRow = prevMap.get(stateRowKey(row));
    if (prevRow && prevRow.effective_value_json !== row.effective_value_json) {
      changes.push({ row, prevRow });
    }
  }
  return changes;
}

/**
 * 「这一轮变了什么」的前端本地 diff。
 *
 * 后端（session_*_state_values / turn_records）目前不下发"上一轮快照"，只有
 * 当前生效值；给状态面板加一份后端快照存储又太重，所以改用最小的前端方案：
 * 缓存上一次 fetchSessionStateValues 的结果，每次 stateData 更新时跟新结果按
 * field_key（角色字段再加 character_id）逐条比较 effective_value_json，找出
 * 变化的字段。
 *
 * 首次加载（刷新页面、切换会话后的第一份数据落地）没有"上一次"可比，这时
 * 不能断言"本轮没有变化"——那是把"不知道"显示成"确认没变"，会误导用户以为
 * 上一轮真的什么都没发生。返回的 `ready` 标记这份 diff 是否基于真实比较得出：
 * ready=false 时调用方不应展示"没有变化"文案，应退化为直接展示完整状态
 * （见 StateChangeCard）。
 *
 * 副作用：用户手动编辑字段也会被记成"变化"——这在语义上是对的（值确实变了），
 * 只是不严格等价于"AI 生成的这一轮"，先如实说明，不引入额外的"是否为用户编辑"
 * 标记（后端没有这个信号，伪造会更复杂也更不可靠）。
 */
export function useStateDiff(stateData, sessionId) {
  const prevDataRef = useRef(null);
  const prevSessionRef = useRef(sessionId);
  const [result, setResult] = useState(EMPTY_RESULT);

  // useLayoutEffect（而非 useEffect）：在浏览器绘制前同步跑完重置 + diff，
  // 避免会话切换那一帧先用旧会话的 diff 渲染一次、再闪成新结果。
  // ref 的读写全部留在 effect 里，不在渲染期访问——渲染期读写 ref 是本项目
  // react-hooks/refs 规则明确禁止的模式。
  useLayoutEffect(() => {
    if (prevSessionRef.current !== sessionId) {
      prevSessionRef.current = sessionId;
      prevDataRef.current = null;
      setResult(EMPTY_RESULT);
      return; // 会话切换的这一轮先不比较，等新会话的第一份 stateData 落地后再开始 diff
    }
    if (!stateData) return;
    const prev = prevDataRef.current;
    setResult(prev ? {
      diff: {
        world: diffSection(prev.world, stateData.world),
        persona: diffSection(prev.persona, stateData.persona),
        character: diffSection(prev.character, stateData.character),
      },
      ready: true,
    } : EMPTY_RESULT);
    prevDataRef.current = stateData;
  }, [sessionId, stateData]);

  return result;
}
