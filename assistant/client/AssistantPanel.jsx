/**
 * 写卡助手侧边面板
 *
 * 从右侧滑入，宽 400px，不阻断背景页操作
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useAssistantStore } from './useAssistantStore.js';
import {
  startAssistantTask,
  answerAssistantTask,
  approveAssistantTaskPlan,
  approveAssistantTaskStep,
  cancelAssistantTask,
} from './api.js';
import MessageList from './MessageList.jsx';
import InputBox from './InputBox.jsx';
import useStore from '../../frontend/src/store/index.js';
import { getWorld } from '../../frontend/src/api/worlds.js';
import { getCharacter } from '../../frontend/src/api/characters.js';
import { getConfig } from '../../frontend/src/api/config.js';
import { refreshCustomCss } from '../../frontend/src/api/custom-css-snippets.js';
import { invalidateCache, loadRules } from '../../frontend/src/utils/regex-runner.js';
import { buildHistory, buildProposalSummary } from './history.js';

export const __testables = {
  buildProposalSummary,
  buildHistory,
};

async function runApplyRefreshEffects(proposal) {
  const refreshEventByType = {
    'world-card': 'we:world-updated',
    'character-card': 'we:character-updated',
    'persona-card': 'we:persona-updated',
    'global-config': 'we:global-config-updated',
  };
  const eventName = refreshEventByType[proposal?.type];
  if (eventName) window.dispatchEvent(new CustomEvent(eventName));
  if (proposal?.type === 'css-snippet') {
    await refreshCustomCss();
  } else if (proposal?.type === 'regex-rule') {
    invalidateCache();
    await loadRules();
  }
}

export default function AssistantPanel() {
  const isOpen = useAssistantStore((s) => s.isOpen);
  const close = useAssistantStore((s) => s.close);
  const messages = useAssistantStore((s) => s.messages);
  const isStreaming = useAssistantStore((s) => s.isStreaming);
  const addMessage = useAssistantStore((s) => s.addMessage);
  const appendToLastAssistant = useAssistantStore((s) => s.appendToLastAssistant);
  const finalizeLastAssistant = useAssistantStore((s) => s.finalizeLastAssistant);
  const replaceRoutingWithProposal = useAssistantStore((s) => s.replaceRoutingWithProposal);
  const setStreaming = useAssistantStore((s) => s.setStreaming);
  const clearMessages = useAssistantStore((s) => s.clearMessages);
  const currentTask = useAssistantStore((s) => s.currentTask);
  const setCurrentTask = useAssistantStore((s) => s.setCurrentTask);
  const patchCurrentTask = useAssistantStore((s) => s.patchCurrentTask);
  const updateTaskStep = useAssistantStore((s) => s.updateTaskStep);
  const editMessage = useAssistantStore((s) => s.editMessage);
  const updateRoutingThinking = useAssistantStore((s) => s.updateRoutingThinking);
  const truncateToMessage = useAssistantStore((s) => s.truncateToMessage);
  const deleteMessage = useAssistantStore((s) => s.deleteMessage);

  const currentWorldId = useStore((s) => s.currentWorldId);
  const currentCharacterId = useStore((s) => s.currentCharacterId);

  const [input, setInput] = useState('');
  const [activeToolCall, setActiveToolCall] = useState(null);
  const abortRef = useRef(null);
  // 标记当前轮次是否已创建流式气泡（防止重复插入）
  const bubbleCreatedRef = useRef(false);

  // 页面刷新后，localStorage 中残留的活跃任务无法恢复 SSE 流，自动清除并提示
  useEffect(() => {
    const ACTIVE_STATUSES = new Set(['pending', 'researching', 'clarifying', 'running', 'awaiting_plan_approval', 'awaiting_step_approval']);
    if (currentTask && ACTIVE_STATUSES.has(currentTask.status)) {
      setCurrentTask(null);
      addMessage({ role: 'error', content: '上次任务已中断（页面重载），请重新发起。' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buildContext = useCallback(async () => {
    let context = { worldId: currentWorldId, characterId: currentCharacterId };
    try {
      const [world, character, config] = await Promise.all([
        currentWorldId ? getWorld(currentWorldId).catch(() => null) : Promise.resolve(null),
        currentCharacterId ? getCharacter(currentCharacterId).catch(() => null) : Promise.resolve(null),
        getConfig().catch(() => null),
      ]);
      context = { ...context, world, character, config };
    } catch {
      // 上下文拉取失败不阻断对话
    }
    return context;
  }, [currentWorldId, currentCharacterId]);

  const bindTaskCallbacks = useCallback((callbacks = {}) => ({
    onToolCall: (name) => {
      setActiveToolCall(name);
      callbacks.onToolCall?.(name);
    },
    onDelta: (chunk) => {
      setActiveToolCall(null);
      if (!bubbleCreatedRef.current) {
        addMessage({ role: 'assistant', content: '', streaming: true });
        bubbleCreatedRef.current = true;
      }
      appendToLastAssistant(chunk);
      callbacks.onDelta?.(chunk);
    },
    onRouting: (evt) => {
      setActiveToolCall(null);
      addMessage({ role: 'routing', taskId: evt.taskId, target: evt.target, task: evt.task });
      callbacks.onRouting?.(evt);
    },
    onThinking: (taskId) => {
      updateRoutingThinking(taskId);
      callbacks.onThinking?.(taskId);
    },
    onProposal: (taskId, token, proposal) => {
      replaceRoutingWithProposal(taskId, token, proposal);
      callbacks.onProposal?.(taskId, token, proposal);
    },
    onTaskCreated: (task) => {
      const msgs = useAssistantStore.getState().messages;
      const anchorMessageId = msgs.length > 0 ? msgs[msgs.length - 1].id : null;
      setCurrentTask({ ...task, anchorMessageId });
      callbacks.onTaskCreated?.(task);
    },
    onClarificationRequested: (task, questions, summary) => {
      setCurrentTask(task);
      if (summary) {
        addMessage({ role: 'assistant', content: `${summary}\n\n${questions.map((q, index) => `${index + 1}. ${q}`).join('\n')}` });
      }
      callbacks.onClarificationRequested?.(task, questions, summary);
    },
    onClarificationAnswered: (task) => {
      setCurrentTask(task);
      callbacks.onClarificationAnswered?.(task);
    },
    onResearchStarted: (task) => {
      setCurrentTask(task);
      callbacks.onResearchStarted?.(task);
    },
    onResearchReady: (task, research) => {
      setCurrentTask({ ...(task || {}), research });
      callbacks.onResearchReady?.(task, research);
    },
    onPlanReady: (task) => {
      setCurrentTask(task);
      callbacks.onPlanReady?.(task);
    },
    onPlanApproved: (task) => {
      setCurrentTask(task);
      callbacks.onPlanApproved?.(task);
    },
    onStepStarted: (_taskId, stepId, step) => {
      updateTaskStep(stepId, () => step);
      callbacks.onStepStarted?.(_taskId, stepId, step);
    },
    onStepProposalReady: (_taskId, stepId, proposal, proposalSummary, step) => {
      updateTaskStep(stepId, () => ({
        ...(step || {}),
        proposal,
        proposalSummary,
      }));
      callbacks.onStepProposalReady?.(_taskId, stepId, proposal, proposalSummary, step);
    },
    onStepApprovalRequested: (_taskId, stepId, step) => {
      patchCurrentTask({ status: 'awaiting_step_approval', awaitingStepId: stepId });
      updateTaskStep(stepId, () => step);
      callbacks.onStepApprovalRequested?.(_taskId, stepId, step);
    },
    onStepApproved: (task) => {
      setCurrentTask(task);
      callbacks.onStepApproved?.(task);
    },
    onStepCompleted: (_taskId, stepId, result, step) => {
      updateTaskStep(stepId, () => step);
      runApplyRefreshEffects(step?.proposal).catch(() => {});
      callbacks.onStepCompleted?.(_taskId, stepId, result, step);
    },
    onStepFailed: (_taskId, stepId, error, step) => {
      if (step) updateTaskStep(stepId, () => step);
      patchCurrentTask({ status: 'failed', error });
      addMessage({ role: 'error', content: error });
      callbacks.onStepFailed?.(_taskId, stepId, error, step);
    },
    onStepBlocked: (_taskId, stepId, reason, step) => {
      if (step) updateTaskStep(stepId, () => step);
      callbacks.onStepBlocked?.(_taskId, stepId, reason, step);
    },
    onReplanStarted: (task) => {
      if (task) setCurrentTask(task);
      callbacks.onReplanStarted?.(task);
    },
    onReplanReady: (task) => {
      if (task) setCurrentTask(task);
      callbacks.onReplanReady?.(task);
    },
    onTaskCompleted: () => {
      const taskSnapshot = useAssistantStore.getState().currentTask;
      patchCurrentTask({ status: 'completed' });

      const steps = taskSnapshot?.plan?.steps || taskSnapshot?.graph || [];
      const doneSteps = steps.filter((s) => s.proposal);
      if (doneSteps.length > 0) {
        let content;
        if (doneSteps.length === 1) {
          content = doneSteps[0].proposal.explanation || '已完成。';
        } else {
          const lines = doneSteps
            .map((s, i) => `${i + 1}. ${s.proposal.explanation || s.title}`)
            .join('\n');
          content = `已完成以下操作：\n\n${lines}`;
        }
        addMessage({ role: 'assistant', content });
      }

      callbacks.onTaskCompleted?.();
    },
    onTaskFailed: (_taskId, error, task) => {
      if (task) setCurrentTask(task);
      addMessage({ role: 'error', content: error });
      callbacks.onTaskFailed?.(_taskId, error, task);
    },
    onDone: () => {
      setActiveToolCall(null);
      finalizeLastAssistant();
      callbacks.onDone?.();
    },
    onError: (err) => {
      setActiveToolCall(null);
      finalizeLastAssistant();
      addMessage({ role: 'error', content: err });
      callbacks.onError?.(err);
    },
    onStreamEnd: () => {
      setActiveToolCall(null);
      finalizeLastAssistant();
      setStreaming(false);
      abortRef.current = null;
      callbacks.onStreamEnd?.();
    },
  }), [
    addMessage,
    appendToLastAssistant,
    finalizeLastAssistant,
    patchCurrentTask,
    replaceRoutingWithProposal,
    setCurrentTask,
    setStreaming,
    updateRoutingThinking,
    updateTaskStep,
  ]);

  // 核心发送逻辑（接受文本和历史，不依赖 input state）
  const sendContent = useCallback(async (text, history) => {
    const context = await buildContext();
    setStreaming(true);
    setActiveToolCall(null);
    bubbleCreatedRef.current = false;
    const abort = startAssistantTask(
      { message: text, history, context },
      bindTaskCallbacks(),
    );
    abortRef.current = abort;
  }, [bindTaskCallbacks, buildContext, setStreaming]);

  const answerClarification = useCallback(async (text) => {
    if (!currentTask?.id) return;
    setStreaming(true);
    setActiveToolCall(null);
    bubbleCreatedRef.current = false;
    const abort = answerAssistantTask(currentTask.id, text, bindTaskCallbacks());
    abortRef.current = abort;
  }, [bindTaskCallbacks, currentTask?.id, setStreaming]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    setInput('');

    // 添加用户消息
    addMessage({ role: 'user', content: text });

    if (currentTask?.status === 'clarifying') {
      await answerClarification(text);
      return;
    }

    const history = buildHistory(messages);
    await sendContent(text, history);
  }, [input, isStreaming, messages, addMessage, sendContent, currentTask?.status, answerClarification]);

  // 用户消息编辑后重新生成
  const handleUserEdit = useCallback(async (msgId, newContent) => {
    if (isStreaming) return;

    // 找到该 user 消息在列表中的位置
    const currentMsgs = useAssistantStore.getState().messages;
    const idx = currentMsgs.findIndex((m) => m.id === msgId);
    if (idx < 0) return;

    // 更新消息内容
    editMessage(msgId, newContent);

    // 删除该 user 消息之后的所有消息
    const msgsAfter = currentMsgs.slice(idx + 1);
    for (const m of msgsAfter) {
      deleteMessage(m.id);
    }

    // 构建历史（该 user 消息之前，proposal 摘要前置到同轮 assistant）
    const history = buildHistory(currentMsgs.slice(0, idx));

    await sendContent(newContent, history);
  }, [isStreaming, editMessage, deleteMessage, sendContent]);

  // 助手消息重新生成
  const handleAssistantRegenerate = useCallback(async (msgId) => {
    if (isStreaming) return;

    const currentMsgs = useAssistantStore.getState().messages;
    const idx = currentMsgs.findIndex((m) => m.id === msgId);
    if (idx < 0) return;

    // 找到该 assistant 消息之前的最后一条 user 消息
    const prevUserMsg = [...currentMsgs].slice(0, idx).reverse().find((m) => m.role === 'user');
    if (!prevUserMsg) return;

    // 截断到该 assistant 消息（不含）
    truncateToMessage(msgId);

    // 构建历史（prevUserMsg 之前，proposal 摘要前置到同轮 assistant）
    const prevUserIdx = currentMsgs.findIndex((m) => m.id === prevUserMsg.id);
    const history = buildHistory(currentMsgs.slice(0, prevUserIdx));

    await sendContent(prevUserMsg.content, history);
  }, [isStreaming, truncateToMessage, sendContent]);

  // 删除消息
  const handleDeleteMessage = useCallback((msgId) => {
    deleteMessage(msgId);
  }, [deleteMessage]);

  const handleApprovePlan = useCallback(async () => {
    if (!currentTask?.id || isStreaming) return;
    setStreaming(true);
    setActiveToolCall(null);
    bubbleCreatedRef.current = false;
    abortRef.current = approveAssistantTaskPlan(currentTask.id, bindTaskCallbacks());
  }, [bindTaskCallbacks, currentTask?.id, isStreaming, setStreaming]);

  const handleApproveStep = useCallback((stepId, editedProposal) => {
    if (!currentTask?.id || !stepId || isStreaming) return Promise.reject(new Error('正在执行中，请稍候'));
    return new Promise((resolve, reject) => {
      setStreaming(true);
      setActiveToolCall(null);
      bubbleCreatedRef.current = false;
      abortRef.current = approveAssistantTaskStep(currentTask.id, stepId, editedProposal, bindTaskCallbacks({
        onStepCompleted: (_taskId, completedStepId, result, step) => {
          if (completedStepId === stepId) resolve({ result, step });
        },
        onTaskFailed: (_taskId, error, task) => {
          reject(new Error(error || task?.error || '任务执行失败'));
        },
        onError: (error) => {
          reject(new Error(error || '步骤执行失败'));
        },
      }));
    });
  }, [bindTaskCallbacks, currentTask?.id, isStreaming, setStreaming]);

  const handleCancelTask = useCallback(async () => {
    if (!currentTask?.id) return;
    abortRef.current?.();
    try {
      await cancelAssistantTask(currentTask.id);
    } catch {
      // 取消失败不阻断 UI 更新
    }
    patchCurrentTask({ status: 'cancelled' });
    setStreaming(false);
  }, [currentTask?.id, patchCurrentTask, setStreaming]);

  const handleDismissTask = useCallback(() => {
    setCurrentTask(null);
  }, [setCurrentTask]);

  return (
    <>
      {/* 点击背景遮罩关闭面板 */}
      {isOpen && (
        <div
          onClick={close}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 199,
            background: 'rgba(0,0,0,0.2)',
            cursor: 'default',
          }}
        />
      )}
      {/* 面板 */}
      <div
        style={{
          position: 'fixed',
          top: '40px',
          right: 0,
          bottom: 0,
          width: '400px',
          zIndex: 200,
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--we-paper-base, #f4ede4)',
          borderLeft: '1px solid rgba(0,0,0,0.1)',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.25s ease',
          pointerEvents: isOpen ? 'auto' : 'none',
        }}
      >
        {/* 标题栏 */}
        <div
          style={{
            height: '44px',
            display: 'flex',
            alignItems: 'center',
            padding: '0 14px',
            borderBottom: '1px solid rgba(0,0,0,0.08)',
            background: 'var(--we-paper-aged, #ede6da)',
            flexShrink: 0,
            gap: '8px',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--we-font-display)',
              fontStyle: 'italic',
              fontSize: '14px',
              color: 'var(--we-ink-primary, #3d2e22)',
              flex: 1,
            }}
          >
            ✦ 写卡助手
          </span>

          {messages.length > 0 && (
            <button
              onClick={() => { abortRef.current?.(); clearMessages(); }}
              title={isStreaming ? '停止并清空对话' : '清空对话'}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '11px',
                color: 'var(--we-ink-muted, #9c8a7e)',
                padding: '3px 6px',
                borderRadius: '3px',
              }}
              onMouseEnter={(e) => { e.target.style.background = 'rgba(0,0,0,0.06)'; }}
              onMouseLeave={(e) => { e.target.style.background = 'none'; }}
            >
              清空
            </button>
          )}

          <button
            onClick={close}
            title="关闭"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '16px',
              color: 'var(--we-ink-muted, #9c8a7e)',
              padding: '3px 6px',
              borderRadius: '3px',
              lineHeight: 1,
            }}
            onMouseEnter={(e) => { e.target.style.background = 'rgba(0,0,0,0.06)'; }}
            onMouseLeave={(e) => { e.target.style.background = 'none'; }}
          >
            ×
          </button>
        </div>

        {/* 消息列表 */}
        <MessageList
          messages={messages}
          currentTask={currentTask}
          onUserEdit={handleUserEdit}
          onAssistantRegenerate={handleAssistantRegenerate}
          onDeleteMessage={handleDeleteMessage}
          onApprovePlan={handleApprovePlan}
          onApproveStep={handleApproveStep}
          onCancelTask={handleCancelTask}
          onDismissTask={handleDismissTask}
          isStreaming={isStreaming}
          activeToolCall={activeToolCall}
        />

        {/* 输入框 */}
        <InputBox
          value={input}
          onChange={setInput}
          onSend={handleSend}
          onStop={() => abortRef.current?.()}
          isStreaming={isStreaming}
        />
      </div>
    </>
  );
}
