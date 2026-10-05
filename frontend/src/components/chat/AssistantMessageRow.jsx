import React from 'react';
import { motion } from 'framer-motion';
import SeamlessEditableSurface from '../../../../shared/SeamlessEditableSurface.jsx';
import ActivatedEntriesRow from '../message/ActivatedEntriesRow.jsx';
import TokenUsageRow from '../message/TokenUsageRow.jsx';
import { CopyButton, DeleteButton, EditButton, EditConfirmActions, RegenerateButton } from '../message/MessageActions.jsx';
import { AssistantMessageContent, AttachmentThumbnail, MessageTime } from './MessageItemShared.jsx';
import TurnChangeStrip from './TurnChangeStrip.jsx';

const MotionDiv = motion.div;

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
        <EditConfirmActions onCancel={cancelEditAI} onConfirm={confirmEditAI} confirmLabel="保存" />
      ) : (
        <div className="we-message-actions-buttons">
          <MessageTime createdAt={message.created_at} />
          <CopyButton getText={() => displayContent} />
          <RegenerateButton onClick={() => onRegenerate(message.id)} />
          {startEditAI && <EditButton onClick={startEditAI} label="编辑 AI 回复" />}
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
  moment,
  onTypedOut,
  turnChanges,
}) {
  const hasEntries = !editingAI && message.activated_entries?.length > 0;
  const tokenRowVisible = !editingAI && !isStreaming && message.token_usage && showTokenUsage;
  const entriesGoWithActions = !tokenRowVisible && hasEntries && !editingAI;

  return (
    <MotionDiv
      data-message-id={message?.id}
      data-moment={moment}
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
                  onTypedOut={onTypedOut}
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
          {!editingAI && <TurnChangeStrip changes={turnChanges} />}
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
