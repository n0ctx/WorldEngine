/**
 * 写卡助手面板的本地持久化：把 store 的一份 state 拆成两块写 localStorage，
 * 以及消息写盘前的清洗。
 */

const HEAVY_KEY = 'we-assistant-v2';
const LIVE_KEY = 'we-assistant-v2:live';

export const ASSISTANT_STORAGE_NAME = HEAVY_KEY;

// 自定义持久化存储，把一份 state 拆成两块写 localStorage：
// - 重块 HEAVY_KEY 只放 messages。流式（status==='running'）期间不写：每个 DELTA 帧都
//   JSON.stringify 整个 messages 成本是 O(n²)；保留上一次终态写入的历史，刷新后由
//   后端任务快照补齐。
// - 轻块 LIVE_KEY 放其余字段（taskId、状态、输入栏草稿、滚动位置等），都是小值，
//   流式期间照写。否则任务跑起来后的新 taskId、正在打的字都要等任务结束才落盘，
//   中途刷新就找不回。
// 读的时候两块合并，轻块优先。
export function createSplitStorage() {
  return {
    getItem: () => {
      const heavy = readJson(HEAVY_KEY);
      const live = readJson(LIVE_KEY);
      if (!heavy && !live) return null;
      return { state: { ...heavy?.state, ...live?.state }, version: live?.version ?? heavy?.version ?? 0 };
    },
    setItem: (_name, value) => {
      const { messages, ...rest } = value?.state ?? {};
      writeJson(LIVE_KEY, { state: rest, version: value?.version });
      if (rest.status === 'running') return;
      writeJson(HEAVY_KEY, { state: { messages: sanitizeMessagesForPersist(messages) }, version: value?.version });
    },
    removeItem: () => {
      try {
        globalThis.localStorage?.removeItem(HEAVY_KEY);
        globalThis.localStorage?.removeItem(LIVE_KEY);
      } catch {
        // 静默失败
      }
    },
  };
}

function readJson(key) {
  try {
    const str = globalThis.localStorage?.getItem(key);
    return str ? JSON.parse(str) : null;
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    // 静默失败：localStorage 不可用（隐私模式 / 配额满）
  }
}

// 持久化用清洗：保留可回放的对话和助手 UI 记录；刷新后不能恢复真实运行态，
// 因此把残留 running 标为 error，避免显示一条永远运行中的工具/步骤。
export function sanitizeMessagesForPersist(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((m) => m && ['user', 'assistant', 'tool_call', 'compaction'].includes(m.role))
    .map((m) => {
      if (m.role === 'assistant' && m.streaming) {
        const rest = { ...m };
        delete rest.streaming;
        return rest;
      }
      if (m.role === 'tool_call' && m.status === 'running') {
        return { ...m, status: 'error', error: m.error ?? '刷新后运行状态已中断' };
      }
      return m;
    });
}

export const __testables = { HEAVY_KEY, LIVE_KEY };
