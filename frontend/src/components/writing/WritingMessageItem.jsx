import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { markdownSanitizeSchema } from '../../core/utils/markdown-sanitize.js';
import { useDisplaySettingsStore } from '../../core/state/displaySettings.js';
import { useMessageEditing } from '../../core/hooks/useMessageEditing.js';
import { applyRules } from '../../core/utils/regex-runner.js';
import ActivatedEntriesRow from '../message/ActivatedEntriesRow.jsx';
import SeamlessEditableSurface from '../../../../shared/SeamlessEditableSurface.jsx';
import MessageBlockList from '../message/MessageBlockList.jsx';
import { useLiveMoment, useMessageBlocks } from '../message/useMessageHooks.js';
import ThinkBlock from '../message/ThinkBlock.jsx';
import TokenUsageRow from '../message/TokenUsageRow.jsx';
import TurnChangeStrip from '../chat/TurnChangeStrip.jsx';
import { CopyButton, DeleteButton, EditButton, EditConfirmActions, RegenerateButton } from '../message/MessageActions.jsx';
const REMARK_PLUGINS_W = [remarkGfm];
const REHYPE_PLUGINS_W = [rehypeRaw, [rehypeSanitize, markdownSanitizeSchema]];
function WritingThinkBlock(props) {
  const autoCollapse = useDisplaySettingsStore((s) => s.writingAutoCollapseThinking);
  return <ThinkBlock {...props} autoCollapse={autoCollapse} />;
}

// 流式期间 continuingText / streamingText 每个 token 变化都会重渲染整个渲染窗口；
// 历史消息 message 引用稳定，靠 memo 跳过其正则替换 / 分块 / Markdown 重解析。
// 回调 props（onEdit 等）是每次渲染新建的薄壳（执行时经 getRuntime() 取最新状态），忽略其引用；
// onEditAssistant 的有无随 lastAssistantId 切换，比较 Boolean。
function areWritingItemPropsEqual(prev, next) {
  return prev.message === next.message
    && prev.isStreaming === next.isStreaming
    && prev.showCaret === next.showCaret
    && prev.worldId === next.worldId
    && prev.turnChanges === next.turnChanges
    && Boolean(prev.onEditAssistant) === Boolean(next.onEditAssistant);
}

function WritingMessageItem({
  message,
  isStreaming = false,
  showCaret = true,
  onEdit,
  onRegenerate,
  onEditAssistant,
  onDelete,
  worldId,
  turnChanges,
}) {
  const moment = useLiveMoment(isStreaming);
  const rawContent = message.content || '';
  const isUser = message.role === 'user';
  const showThinking = useDisplaySettingsStore((s) => s.writingShowThinking);
  const showTokenUsage = useDisplaySettingsStore((s) => s.writingShowTokenUsage);
  const currentModelPricing = useDisplaySettingsStore((s) => s.currentWritingModelPricing);

  let displayContent = rawContent;
  let interrupted = false;
  if (/\n{0,2}\[已中断\]\s*$/.test(displayContent)) {
    displayContent = displayContent.replace(/\n{0,2}\[已中断\]\s*$/, '');
    interrupted = true;
  }
  displayContent = applyRules(displayContent, 'display_only', worldId ?? null, 'writing');
  const { blocks, trailingCaret } = useMessageBlocks(
    displayContent,
    showThinking,
    showCaret,
    isStreaming,
  );
  const content = displayContent;

  const {
    editing, draft, setDraft, startEdit, confirmEdit, cancelEdit, handleKeyDown,
    editingAI, aiDraft, setAiDraft, startEditAI, confirmEditAI, cancelEditAI, handleKeyDownAI,
  } = useMessageEditing(message, { onEdit, onEditAssistant });

  if (!content && !isStreaming) return null;

  /* ── 玩家输入：居中的舞台提示 ── */
  if (isUser) {
    return (
      <div
        data-message-id={message?.id}
        className="we-writing-annotation"
      >
        <SeamlessEditableSurface
          editing={editing}
          selectEnd
          trackValue={draft}
          surfaceClassName={editing ? 'we-writing-annotation--editing' : ''}
          readClassName="we-writing-annotation__text"
          renderRead={() => (
            <ReactMarkdown remarkPlugins={REMARK_PLUGINS_W} rehypePlugins={REHYPE_PLUGINS_W}>
              {content}
            </ReactMarkdown>
          )}
          renderEditor={({ editorRef, syncLayout }) => (
            <textarea
              ref={editorRef}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                syncLayout();
              }}
              onKeyDown={handleKeyDown}
              rows={2}
              className="we-seamless-edit__textarea we-message-edit__textarea we-writing-annotation__textarea"
            />
          )}
        />
        {!isStreaming && (
          <div className="we-message-actions">
            {editing ? (
              <EditConfirmActions onCancel={cancelEdit} onConfirm={confirmEdit} confirmLabel="确认" />
            ) : (
              <>
                <CopyButton getText={() => content} />
                {startEdit && <EditButton onClick={startEdit} />}
                {onDelete && <DeleteButton onDelete={() => onDelete(message.id)} />}
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  /* ── 助手叙事：书页正文散文风格 ── */
  return (
    <div
      data-message-id={message?.id}
      data-moment={moment}
      className="we-writing-prose"
    >
      <>
        <SeamlessEditableSurface
          editing={editingAI}
          trackValue={aiDraft}
          surfaceClassName={editingAI ? 'we-writing-prose--editing' : ''}
          readClassName="we-message-content"
          renderRead={() => (
            <>
              <MessageBlockList
                blocks={blocks}
                interrupted={interrupted}
                showThinking={showThinking}
                isStreaming={isStreaming}
                showCaret={showCaret}
                trailingCaret={trailingCaret}
                ThinkBlock={WritingThinkBlock}
                remarkPlugins={REMARK_PLUGINS_W}
                rehypePlugins={REHYPE_PLUGINS_W}
              />
            </>
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
              rows={6}
              className="we-seamless-edit__textarea we-message-edit__textarea"
            />
          )}
        />
          {(() => {
            const tokenRowVisible = !editingAI && !isStreaming && message.token_usage && showTokenUsage;
            const hasEntries = !editingAI && !isStreaming && message.activated_entries?.length > 0;
            const entriesGoWithToken = tokenRowVisible && hasEntries;
            const entriesGoWithActions = !tokenRowVisible && hasEntries;
            return (
              <>
                {!editingAI && <TurnChangeStrip changes={turnChanges} />}
                {tokenRowVisible && (
                  <TokenUsageRow
                    message={message}
                    currentModelPricing={currentModelPricing}
                    showEntries={entriesGoWithToken}
                  />
                )}
                {!isStreaming && (
                  <div className="we-message-actions">
                    {editingAI ? (
                      <EditConfirmActions onCancel={cancelEditAI} onConfirm={confirmEditAI} confirmLabel="保存" />
                    ) : (
                      <div className="we-message-actions-buttons">
                        <CopyButton getText={() => content} />
                        <RegenerateButton onClick={() => onRegenerate?.(message.id)} />
                        {startEditAI && <EditButton onClick={startEditAI} label="编辑 AI 回复" />}
                        {onDelete && <DeleteButton onDelete={() => onDelete(message.id)} />}
                      </div>
                    )}
                    {entriesGoWithActions && !editingAI && (
                      <ActivatedEntriesRow entries={message.activated_entries} />
                    )}
                  </div>
                )}
              </>
            );
          })()}
      </>
    </div>
  );
}

export default React.memo(WritingMessageItem, areWritingItemPropsEqual);
