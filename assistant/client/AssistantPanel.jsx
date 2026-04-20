/**
 * 写卡助手侧边面板
 *
 * 从右侧滑入，宽 400px，不阻断背景页操作
 */

import { useState, useCallback, useRef } from 'react';
import { useAssistantStore } from './useAssistantStore.js';
import { chatAssistant } from './api.js';
import MessageList from './MessageList.jsx';
import InputBox from './InputBox.jsx';
import useStore from '../../frontend/src/store/index.js';
import { getWorld } from '../../frontend/src/api/worlds.js';
import { getCharacter } from '../../frontend/src/api/characters.js';
import { getConfig } from '../../frontend/src/api/config.js';

// ── 历史构建工具 ──────────────────────────────────────────────────

/**
 * 将 proposal 消息序列化为给主代理看的结构化摘要文本。
 * 目的：下一轮对话时模型能引用上一轮的实际提案内容，避免多轮编辑漂移。
 */
function buildProposalSummary(proposal) {
  const TYPE_SHORT = { 'world-card': '世界卡', 'character-card': '角色卡', 'persona-card': '玩家卡', 'global-config': '全局设置', 'css-snippet': '自定义CSS', 'regex-rule': '正则规则' };
  const OP_SHORT = { create: '新建', update: '修改', delete: '删除' };
  const lines = [`[${TYPE_SHORT[proposal.type] || proposal.type}${OP_SHORT[proposal.operation] || proposal.operation}]`];
  for (const [k, v] of Object.entries(proposal.changes || {})) {
    lines.push(`${k}: ${typeof v === 'string' ? v.slice(0, 120) : v}`);
  }
  const entryCount = Array.isArray(proposal.entryOps) ? proposal.entryOps.length : 0;
  const sfCount = Array.isArray(proposal.stateFieldOps) ? proposal.stateFieldOps.length : 0;
  if (entryCount) lines.push(`条目操作: ${entryCount}条`);
  if (sfCount) lines.push(`状态字段操作: ${sfCount}条`);
  return lines.join('\n');
}

/**
 * 从消息列表构建发送给后端的对话历史。
 * proposal 摘要前置到同轮 assistant 消息的内容中，确保多轮编辑时模型能看到提案实际内容。
 */
function buildHistory(msgs) {
  const history = [];
  let pendingProposals = [];
  for (const m of msgs) {
    if (m.role === 'user') {
      history.push({ role: 'user', content: m.content });
      pendingProposals = [];
    } else if (m.role === 'proposal' && m.proposal) {
      pendingProposals.push(buildProposalSummary(m.proposal));
    } else if (m.role === 'assistant' && m.content) {
      const prefix = pendingProposals.length > 0 ? pendingProposals.join('\n---\n') + '\n\n' : '';
      history.push({ role: 'assistant', content: prefix + m.content });
      pendingProposals = [];
    }
  }
  return history;
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
  const editMessage = useAssistantStore((s) => s.editMessage);
  const truncateToMessage = useAssistantStore((s) => s.truncateToMessage);
  const deleteMessage = useAssistantStore((s) => s.deleteMessage);

  const currentWorldId = useStore((s) => s.currentWorldId);
  const currentCharacterId = useStore((s) => s.currentCharacterId);

  const [input, setInput] = useState('');
  const abortRef = useRef(null);
  // 标记当前轮次是否已创建流式气泡（防止重复插入）
  const bubbleCreatedRef = useRef(false);

  // 核心发送逻辑（接受文本和历史，不依赖 input state）
  const sendContent = useCallback(async (text, history) => {
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

    setStreaming(true);
    bubbleCreatedRef.current = false;

    const abort = chatAssistant({ message: text, history, context }, {
      onDelta: (chunk) => {
        // 第一个 delta 到达时才创建气泡，确保在所有子代理调用结束后才出现
        if (!bubbleCreatedRef.current) {
          addMessage({ role: 'assistant', content: '', streaming: true });
          bubbleCreatedRef.current = true;
        }
        appendToLastAssistant(chunk);
      },
      onRouting: (evt) => {
        addMessage({ role: 'routing', taskId: evt.taskId, target: evt.target, task: evt.task });
      },
      onProposal: (taskId, token, proposal) => {
        replaceRoutingWithProposal(taskId, token, proposal);
      },
      onDone: () => {
        finalizeLastAssistant();
      },
      onError: (err) => {
        finalizeLastAssistant();
        addMessage({ role: 'error', content: err });
      },
      onStreamEnd: () => {
        finalizeLastAssistant();
        setStreaming(false);
        abortRef.current = null;
      },
    });
    abortRef.current = abort;
  }, [
    currentWorldId, currentCharacterId,
    addMessage, appendToLastAssistant, finalizeLastAssistant,
    replaceRoutingWithProposal, setStreaming,
  ]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    setInput('');

    // 添加用户消息
    addMessage({ role: 'user', content: text });

    // 构建对话历史（proposal 摘要前置到同轮 assistant 消息，保留多轮提案上下文）
    const history = buildHistory(messages);

    await sendContent(text, history);
  }, [input, isStreaming, messages, addMessage, sendContent]);

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
          onUserEdit={handleUserEdit}
          onAssistantRegenerate={handleAssistantRegenerate}
          onDeleteMessage={handleDeleteMessage}
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
