import { log } from '../utils/logger.js';
import { parseContinuationText } from '../utils/next-prompt.js';
import { RESTART_INTERRUPTED_ERROR } from '../utils/constants.js';

function materializeInterruptedMessages(task) {
  const base = Array.isArray(task?.messages) ? task.messages : [];
  if (task?.continuingMessageId && task?.continuingText) {
    return base.map((message) =>
      message.id === task.continuingMessageId
        ? { ...message, content: `${message.content}\n\n${parseContinuationText(task.continuingText).content}` }
        : message
    );
  }
  if (task?.streamingText) {
    return [
      ...base,
      {
        id: `__recovered_${task.id}`,
        _key: `__recovered_${task.id}`,
        role: 'assistant',
        content: task.streamingText,
        created_at: Date.now(),
      },
    ];
  }
  return base;
}

function showStreamRecoveryToast(task, mode, recoveryToastKeyRef) {
  const key = `${task.id}:${task.updatedAt ?? ''}:${task.status}:${task.error ?? ''}`;
  if (recoveryToastKeyRef.current === key) return;
  recoveryToastKeyRef.current = key;
  if (task.status === 'failed' && task.error === RESTART_INTERRUPTED_ERROR) {
    log.warn(`${mode}.resume.interrupted`, null, { toast: '已恢复中断前内容，旧生成因服务重启已停止' });
    return;
  }
  log.info(`${mode}.resume.reconnected`, null, { toast: '已恢复生成连接' });
}

export function applyStreamRecoverySnapshot(task, state) {
  const interrupted = task.status === 'failed' && task.error === RESTART_INTERRUPTED_ERROR;
  const nextMessages = interrupted ? materializeInterruptedMessages(task) : (task.messages ?? []);
  state.messageListRef.current?.updateMessages?.(() => nextMessages);
  state.pendingOptionsRef.current = Array.isArray(task.options) ? task.options : [];
  state.streamingOptionsRef.current = Array.isArray(task.options) ? task.options : [];
  state.pendingEntriesRef.current = Array.isArray(task.activatedEntries) ? task.activatedEntries : [];
  if (Array.isArray(task.options) && task.options.length > 0) {
    state.setCurrentOptions(task.options);
    state.setOptionCollapsed(false);
  } else {
    state.setCurrentOptions([]);
  }
  if (task.continuingMessageId && !interrupted) {
    state.continuingMessageIdRef.current = task.continuingMessageId;
    state.continuingTextRef.current = task.continuingText || '';
    state.setContinuingMessageId(task.continuingMessageId);
    state.setContinuingText(parseContinuationText(task.continuingText || '', true).content);
    state.streamingTextRef.current = '';
    state.setStreamingText('');
  } else {
    state.continuingMessageIdRef.current = null;
    state.continuingTextRef.current = '';
    state.setContinuingMessageId(null);
    state.setContinuingText('');
    state.streamingTextRef.current = interrupted ? '' : (task.streamingText || '');
    state.setStreamingText(interrupted ? '' : (task.streamingText || ''));
  }
  if (interrupted && task.streamingText) state.setErrorBubble({ partialContent: '', errorMsg: task.error });
  state.setGenerating(!interrupted);
}

export async function recoverSessionStream(targetSessionId, state) {
  if (!targetSessionId) return;
  try {
    const task = await state.api.recoverStream(targetSessionId);
    if (!task || state.sessionIdRef.current !== targetSessionId) return;
    state.applySnapshot(task);
    showStreamRecoveryToast(task, state.mode, state.recoveryToastKeyRef);
    if (task.status === 'failed' && task.error === RESTART_INTERRUPTED_ERROR) return;
    state.recoveryStopRef.current?.();
    const runId = state.streamRunIdRef.current + 1;
    state.streamRunIdRef.current = runId;
    state.recoveryStopRef.current = state.api.subscribeStream(targetSessionId, {
      ...state.makeCallbacks(runId, targetSessionId),
      onStreamSnapshot: (snapshot) => {
        if (snapshot && state.sessionIdRef.current === targetSessionId) state.applySnapshot(snapshot);
      },
    });
  } catch (err) {
    log.error(`${state.mode}.resume.failed`, err, { toast: err.message || '断点续传恢复失败' });
  }
}
