import React from 'react';
import { motion } from 'framer-motion';
import { applyRules } from '../../core/utils/regex-runner.js';
import { useDisplaySettingsStore } from '../../core/state/displaySettings.js';
import { useMessageEditing } from '../../core/hooks/useMessageEditing.js';
import { useMessageBlocks } from '../message/useMessageHooks.js';
import StreamingMarkdown, { StreamCaret } from './StreamingMarkdown.jsx';
import UserMessageRow from './UserMessageRow.jsx';
import AssistantMessageRow from './AssistantMessageRow.jsx';
import { useMotion } from '../../core/hooks/useMotion.js';
import { DURATION } from '../../core/utils/motion.js';

const MotionDiv = motion.div;

// 流式期间 streamingText 每个 token 变化都会重渲染整个渲染窗口；历史消息的 message 引用稳定，
// 靠 memo 跳过其正则替换 / 分块 / Markdown 重解析（聊得越久越卡的主因）。
// 回调 props（onEdit 等）是每次渲染新建的薄壳（执行时经 getRuntime() 取最新状态），比较器忽略其引用；
// onEditAssistant 的有无随 lastAssistantId 切换（最后一条 assistant 的编辑入口），必须比较 Boolean。
function areMessageItemPropsEqual(prev, next) {
  return prev.message === next.message
    && prev.character === next.character
    && prev.persona === next.persona
    && prev.worldId === next.worldId
    && prev.isStreaming === next.isStreaming
    && prev.streamingText === next.streamingText
    && prev.showCaret === next.showCaret
    && prev.isGreeting === next.isGreeting
    && Boolean(prev.onEditAssistant) === Boolean(next.onEditAssistant);
}

function MessageItem({
  message,
  character,
  persona,
  worldId,
  isStreaming,
  streamingText,
  showCaret = true,
  onEdit,
  onRegenerate,
  onEditAssistant,
  onDelete,
  isGreeting = false,
}) {
  const {
    editing, draft, setDraft, startEdit, confirmEdit, cancelEdit, handleKeyDown,
    editingAI, aiDraft, setAiDraft, startEditAI, confirmEditAI, cancelEditAI, handleKeyDownAI,
  } = useMessageEditing(message, { onEdit, onEditAssistant });

  const showThinking = useDisplaySettingsStore((s) => s.showThinking);
  const showTokenUsage = useDisplaySettingsStore((s) => s.showTokenUsage);
  const currentModelPricing = useDisplaySettingsStore((s) => s.currentModelPricing);
  const isUser = message.role === 'user';
  const m = useMotion();
  const enterProps = {
    variants: m.variant('enter'),
    initial: 'hidden',
    animate: 'visible',
    transition: m.transition('enter'),
    exit: 'exit',
  };

  const speakerName = isUser
    ? (persona?.name || '玩家')
    : (character?.name || '旁白');

  let displayContent = isStreaming ? (streamingText || '') : (message.content || '');
  let interrupted = false;
  if (/\n{0,2}\[已中断\]\s*$/.test(displayContent)) {
    displayContent = displayContent.replace(/\n{0,2}\[已中断\]\s*$/, '');
    interrupted = true;
  }
  displayContent = applyRules(displayContent, 'display_only', worldId ?? null);

  const { blocks, trailingCaret } = useMessageBlocks(
    displayContent,
    showThinking,
    showCaret,
    isStreaming,
  );

  if (isStreaming && !streamingText) {
    return (
      <MotionDiv
        data-message-id={message?.id}
        className="we-message-row we-message-assistant"
        {...enterProps}
        transition={m.transition('enter', { delay: DURATION.base })}
      >
        <div className="we-message-row-inner">
          <div className="we-message-body--assistant">
            <div className="we-message-label">{speakerName}</div>
            <div className="we-message-bubble-assistant">
              <div className="we-message-content">
                {showCaret && <StreamCaret />}
              </div>
            </div>
          </div>
        </div>
      </MotionDiv>
    );
  }

  if (isUser) {
    return (
      <UserMessageRow
        message={message}
        speakerName={speakerName}
        displayContent={displayContent}
        editing={editing}
        draft={draft}
        setDraft={setDraft}
        handleKeyDown={handleKeyDown}
        cancelEdit={cancelEdit}
        confirmEdit={confirmEdit}
        startEdit={startEdit}
        onDelete={onDelete}
        enterProps={enterProps}
      />
    );
  }

  return (
    <AssistantMessageRow
      message={message}
      speakerName={speakerName}
      displayContent={displayContent}
      interrupted={interrupted}
      blocks={blocks}
      trailingCaret={trailingCaret}
      showThinking={showThinking}
      showTokenUsage={showTokenUsage}
      currentModelPricing={currentModelPricing}
      isStreaming={isStreaming}
      showCaret={showCaret}
      editingAI={editingAI}
      aiDraft={aiDraft}
      setAiDraft={setAiDraft}
      handleKeyDownAI={handleKeyDownAI}
      cancelEditAI={cancelEditAI}
      confirmEditAI={confirmEditAI}
      startEditAI={startEditAI}
      onRegenerate={onRegenerate}
      onDelete={onDelete}
      isGreeting={isGreeting}
      enterProps={enterProps}
    />
  );
}

export default React.memo(MessageItem, areMessageItemPropsEqual);
