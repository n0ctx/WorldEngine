import React, { useState } from 'react';
import { motion } from 'framer-motion';
import Icon from '../ui/Icon.jsx';
import { variants, transitions } from '../../core/utils/motion.js';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { markdownSanitizeSchema } from '../../core/utils/markdown-sanitize.js';
import { useDisplaySettingsStore } from '../../core/state/displaySettings.js';
import { useMessageEditing } from '../../core/hooks/useMessageEditing.js';
import { formatTokens, calcCost, formatCost } from '../../core/utils/token-usage.js';
import { applyRules } from '../../core/utils/regex-runner.js';
import { stripNextPromptBlocks } from '../../core/utils/next-prompt.js';
import ActivatedEntriesRow from '../chat/ActivatedEntriesRow.jsx';
import InterruptedMark from '../chat/InterruptedMark.jsx';
import StreamingMarkdown, { StreamCaret } from '../chat/StreamingMarkdown.jsx';
import SeamlessEditableSurface from '../../../../shared/SeamlessEditableSurface.jsx';
import MessageBlockList from '../message/MessageBlockList.jsx';
import { useMessageBlocks } from '../message/useMessageBlocks.js';
import { useCopyFeedback, useDeleteConfirmation } from '../message/useMessageActionState.js';

const MotionDiv = motion.div;

const REMARK_PLUGINS_W = [remarkGfm];
const REHYPE_PLUGINS_W = [rehypeRaw, [rehypeSanitize, markdownSanitizeSchema]];
const THINK_REMARK_PLUGINS_W = [remarkGfm];
const THINK_REHYPE_PLUGINS_W = [[rehypeSanitize, markdownSanitizeSchema]];

function ThinkBlock({ content, open = false, streaming = false, caret = false, interrupted = false }) {
  const autoCollapse = useDisplaySettingsStore((s) => s.autoCollapseThinking);
  const [expanded, setExpanded] = useState(!autoCollapse);
  const cleanContent = stripNextPromptBlocks(content);

  return (
    <div className="we-writing-think">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="we-writing-think-toggle"
      >
        <Icon size={16} className={`we-writing-think-icon${expanded ? ' we-writing-think-icon--expanded' : ''}`}>
          <polyline points="9 18 15 12 9 6" />
        </Icon>
        思考过程{open && <span className="we-writing-think-open">…</span>}
        {caret && !expanded && <StreamCaret />}
      </button>
      {expanded && (
        <div className="we-writing-think-body">
          <StreamingMarkdown streaming={streaming} caret={caret} remarkPlugins={THINK_REMARK_PLUGINS_W} rehypePlugins={THINK_REHYPE_PLUGINS_W}>
            {cleanContent}
          </StreamingMarkdown>
          {interrupted && <InterruptedMark />}
        </div>
      )}
    </div>
  );
}

function CopyBtn({ getText }) {
  const { copied, copy } = useCopyFeedback(getText);
  return (
    <button onClick={copy}>
      <Icon size={16}>
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </Icon>
      {copied ? '已复制' : '复制'}
    </button>
  );
}

function DeleteBtn({ onDelete }) {
  const { confirming, handleClick } = useDeleteConfirmation(onDelete);

  return (
    <button
      onClick={handleClick}
      className={confirming ? 'we-message-action-danger' : undefined}
    >
      <Icon size={16}>
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
        <path d="M10 11v6M14 11v6" />
        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      </Icon>
      {confirming ? '确认？' : '删除'}
    </button>
  );
}

export default function WritingMessageItem({
  message,
  isStreaming = false,
  showCaret = true,
  onEdit,
  onRegenerate,
  onEditAssistant,
  onDelete,
  worldId,
}) {
  const rawContent = message.content || '';
  const isUser = message.role === 'user';
  const showThinking = useDisplaySettingsStore((s) => s.showThinking);
  const showTokenUsage = useDisplaySettingsStore((s) => s.showTokenUsage);
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
      <MotionDiv
        data-message-id={message?.id}
        className="we-writing-annotation"
        initial="hidden"
        animate="visible"
        variants={variants.inkRise}
        transition={transitions.ink}
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
              <div className="we-message-edit-actions">
                <button onClick={cancelEdit}>取消</button>
                <button className="primary" onClick={confirmEdit}>确认</button>
              </div>
            ) : (
              <>
                <CopyBtn getText={() => content} />
                <button onClick={startEdit}>
                  <Icon size={16}>
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </Icon>
                  编辑
                </button>
                {onDelete && <DeleteBtn onDelete={() => onDelete(message.id)} />}
              </>
            )}
          </div>
        )}
      </MotionDiv>
    );
  }

  /* ── 助手叙事：书页正文散文风格 ── */
  return (
    <MotionDiv
      data-message-id={message?.id}
      className="we-writing-prose"
      initial="hidden"
      animate="visible"
      variants={variants.inkRise}
      transition={transitions.ink}
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
                ThinkBlock={ThinkBlock}
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
                {tokenRowVisible && (
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
                    {formatCost(calcCost(message.token_usage, currentModelPricing)) && (
                      <span className="we-token-usage-cost" title="本条消息估算费用（美元）">
                        {formatCost(calcCost(message.token_usage, currentModelPricing))}
                      </span>
                    )}
                    {entriesGoWithToken && (
                      <ActivatedEntriesRow entries={message.activated_entries} />
                    )}
                  </div>
                )}
                {!isStreaming && (
                  <div className="we-message-actions">
                    {editingAI ? (
                      <div className="we-message-edit-actions">
                        <button onClick={cancelEditAI}>取消</button>
                        <button className="primary" onClick={confirmEditAI}>保存</button>
                      </div>
                    ) : (
                      <div className="we-message-actions-buttons">
                        <CopyBtn getText={() => content} />
                        <button onClick={() => onRegenerate?.(message.id)}>
                          <Icon size={16}>
                            <polyline points="1 4 1 10 7 10" />
                            <path d="M3.51 15a9 9 0 1 0 .49-4.98" />
                          </Icon>
                          重新生成
                        </button>
                        <button onClick={startEditAI}>
                          <Icon size={16}>
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </Icon>
                          编辑
                        </button>
                        {onDelete && <DeleteBtn onDelete={() => onDelete(message.id)} />}
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
    </MotionDiv>
  );
}
