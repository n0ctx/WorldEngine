// 工具循环测试共用的 fake provider 与小工具。

// 可记录的 fake provider：script(iter, attempt, config, state) 返回一轮结果或抛错；
// rec.noToolsMessages 记下每次 completeNoTools 收到的消息，rec.turnStates 记下每次 oneTurn 收到的消息。
export function recordingProvider(script, { noTools = async () => 'no-tools-text' } = {}) {
  const rec = { turnCalls: 0, noToolsMessages: [], turnStates: [] };
  const attempts = new Map();
  rec.provider = {
    initState: (messages) => ({ messages: [...messages] }),
    oneTurn: async (state, _defs, iter, config) => {
      rec.turnCalls += 1;
      rec.turnStates.push(state.messages);
      const attempt = attempts.get(iter) ?? 0;
      attempts.set(iter, attempt + 1);
      return script(iter, attempt, config, state);
    },
    appendToolTurn: (state, turn, results) => ({
      messages: [
        ...state.messages,
        turn.assistantBlock ?? { role: 'assistant', content: null },
        ...results.map((r, k) => ({ role: 'tool', tool_call_id: turn.toolCalls[k].id, content: r })),
      ],
    }),
    completeNoTools: async (state, config) => {
      rec.noToolsMessages.push(state.messages);
      return noTools(state, config);
    },
    stateToMessages: (state) => state.messages,
  };
  return rec;
}

export function toolsTurn(calls, extra = {}) {
  return {
    kind: 'tools',
    toolCalls: calls.map((c, i) => ({ id: c.id ?? `t${i}`, arguments: {}, ...c })),
    ...extra,
  };
}

export function httpError(status, message = `http ${status}`) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function abortError() {
  const err = new Error('The operation was aborted');
  err.name = 'AbortError';
  return err;
}

export function waitForAbort(signal) {
  return new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(abortError()), { once: true });
  });
}

export const toolResultsOf = (messages) => messages.filter((m) => m.role === 'tool').map((m) => m.content);
export const noteOf = (messages) => messages.at(-1).content;
export const userMsg = [{ role: 'user', content: 'x' }];
