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
    addMessage({ role: 'assistant', content: '', streaming: true });

    const abort = chatAssistant({ message: text, history, context }, {
      onDelta: (chunk) => {
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

    // 构建对话历史（过滤 routing/proposal/error，只取 user/assistant）
    const history = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: m.content }));

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

    // 构建历史（该 user 消息之前的 user/assistant）
    const history = currentMsgs
      .slice(0, idx)
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: m.content }));

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

    // 构建历史（prevUserMsg 之前的 user/assistant）
    const prevUserIdx = currentMsgs.findIndex((m) => m.id === prevUserMsg.id);
    const history = currentMsgs
      .slice(0, prevUserIdx)
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: m.content }));

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

          {isStreaming && (
            <button
              onClick={() => { abortRef.current?.(); }}
              title="停止生成"
              style={{
                background: 'none',
                border: '1px solid rgba(192,57,43,0.3)',
                cursor: 'pointer',
                fontSize: '11px',
                color: '#c0392b',
                padding: '3px 8px',
                borderRadius: '3px',
              }}
              onMouseEnter={(e) => { e.target.style.background = 'rgba(192,57,43,0.08)'; }}
              onMouseLeave={(e) => { e.target.style.background = 'none'; }}
            >
              ■ 停止
            </button>
          )}

          {messages.length > 0 && !isStreaming && (
            <button
              onClick={clearMessages}
              title="清空对话"
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
          disabled={isStreaming}
        />
      </div>
    </>
  );
}
