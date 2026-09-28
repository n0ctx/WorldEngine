import React from 'react';
import { motion } from 'framer-motion';
import { PencilLine, RotateCcw } from 'lucide-react';
import { formatTokens, calcCost, formatCost } from '../../core/utils/token-usage.js';
import SeamlessEditableSurface from '../../../../shared/SeamlessEditableSurface.jsx';
import ActivatedEntriesRow from './ActivatedEntriesRow.jsx';
import {
  AssistantMessageContent,
  AttachmentThumbnail,
  CopyButton,
  DeleteButton,
  MessageTime,
} from './MessageItemShared.jsx';

const MotionDiv = motion.div;

function TokenUsageRow({ message, currentModelPricing, showEntries }) {
  const cost = formatCost(calcCost(message.token_usage, currentModelPricing));

  return (
    <div className="we-token-usage">
      <span title="输入 tokens">↑{formatTokens(message.token_usage.prompt_tokens)}</span>
      <span title="输出 tokens">↓{formatTokens(message.token_usage.completion_tokens)}</span>
      {message.token_usage.cache_read_tokens != null && message.token_usage.cache_read_tokens > 0 && (
        <span title="缓存命中 tokens">命中 {formatTokens(message.token_usage.cache_read_tokens)}</span>
      )}
      {message.token_usage.cache_creation_tokens != null && message.token_usage.cache_creation_tokens > 0 && (
        <span title="缓存写入 tokens">写入 {formatTokens(message.token_usage.cache_creation_tokens)}</span>
      )}
      <span className="we-token-usage-unit">tokens</span>
      {cost && (
        <span className="we-token-usage-cost" title="本条消息估算费用（美元）">
          {cost}
        </span>
      )}
      {showEntries && <ActivatedEntriesRow entries={message.activated_entries} />}
    </div>
  );
}

function AssistantMessageActions({
  message,
  displayContent,
  editingAI,
  cancelEditAI,
  confirmEditAI,
  startEditAI,
  onRegenerate,
  onDelete,
  isGreeting,
  showActivatedEntries,
}) {
  if (isGreeting) return null;

  return (
    <div className="we-message-actions">
      {editingAI ? (
        <div className="we-message-edit-actions">
          <button onClick={cancelEditAI}>取消</button>
          <button className="primary" onClick={confirmEditAI}>保存</button>
        </div>
      ) : (
        <div className="we-message-actions-buttons">
          <MessageTime createdAt={message.created_at} />
          <CopyButton getText={() => displayContent} />
          <button onClick={() => onRegenerate(message.id)} aria-label="重新生成 AI 回复">
            <RotateCcw size={16} />
            重新生成
          </button>
          {startEditAI && (
            <button onClick={startEditAI} aria-label="编辑 AI 回复">
              <PencilLine size={16} />
              编辑
            </button>
          )}
          {onDelete && <DeleteButton onDelete={() => onDelete(message.id)} />}
        </div>
      )}
      {showActivatedEntries && !editingAI && (
        <ActivatedEntriesRow entries={message.activated_entries} />
      )}
    </div>
  );
}

export default function AssistantMessageRow({
  message,
  speakerName,
  displayContent,
  interrupted,
  blocks,
  trailingCaret,
  showThinking,
  showTokenUsage,
  currentModelPricing,
  isStreaming,
  showCaret,
  editingAI,
  aiDraft,
  setAiDraft,
  handleKeyDownAI,
  cancelEditAI,
  confirmEditAI,
  startEditAI,
  onRegenerate,
  onDelete,
  isGreeting,
  enterProps,
}) {
  const hasEntries = !editingAI && message.activated_entries?.length > 0;
  const tokenRowVisible = !editingAI && !isStreaming && message.token_usage && showTokenUsage;
  const entriesGoWithActions = !tokenRowVisible && hasEntries && !editingAI;

  return (
    <MotionDiv
      data-message-id={message?.id}
      className="we-message-row we-message-assistant"
      {...enterProps}
    >
      <div className="we-message-row-inner">
        <div className="we-message-body--assistant">
          <div className="we-message-label">
            {speakerName}
            {interrupted && <span className="we-message-interrupted">已中断</span>}
          </div>
          <div className={`we-message-bubble-assistant${editingAI ? ' we-message-bubble--editing' : ''}`}>
            <SeamlessEditableSurface
              editing={editingAI}
              trackValue={aiDraft}
              readClassName="we-message-content"
              renderRead={() => (
                <AssistantMessageContent
                  blocks={blocks}
                  interrupted={interrupted}
                  showThinking={showThinking}
                  isStreaming={isStreaming}
                  showCaret={showCaret}
                  trailingCaret={trailingCaret}
                />
              )}
              renderEditor={({ editorRef, syncLayout }) => (
                <textarea
                  ref={editorRef}
                  value={aiDraft}
                  onChange={(e) => {
                    setAiDraft(e.target.value);
                    syncLayout();
                  }}
                  onKeyDown={handleKeyDownAI}
                  rows={4}
                  className="we-seamless-edit__textarea we-message-edit__textarea"
                />
              )}
            />
            {message.attachments?.length > 0 && (
              <div className="we-message-attachments">
                {message.attachments.map((att, i) => <AttachmentThumbnail key={i} src={att} />)}
              </div>
            )}
          </div>
          {tokenRowVisible && (
            <TokenUsageRow
              message={message}
              currentModelPricing={currentModelPricing}
              showEntries={hasEntries}
            />
          )}
          <AssistantMessageActions
            message={message}
            displayContent={displayContent}
            editingAI={editingAI}
            cancelEditAI={cancelEditAI}
            confirmEditAI={confirmEditAI}
            startEditAI={startEditAI}
            onRegenerate={onRegenerate}
            onDelete={onDelete}
            isGreeting={isGreeting}
            showActivatedEntries={entriesGoWithActions}
          />
        </div>
      </div>
    </MotionDiv>
  );
}
