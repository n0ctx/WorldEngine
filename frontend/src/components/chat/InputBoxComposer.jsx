import { ArrowUp, ImagePlus, Square } from 'lucide-react';
import { MAX_ATTACHMENTS_PER_MESSAGE } from '../../core/utils/constants.js';
import MotionOrb from '../motion/MotionOrb.jsx';
import IconButton from '../ui/IconButton.jsx';
import { SLASH_LISTBOX_ID, slashOptionId } from './useSlashCommands.js';
import SlashCommandMenu from './SlashCommandMenu.jsx';
import AttachmentThumbs from './AttachmentThumbs.jsx';

export default function InputBoxComposer({
  m,
  generating,
  attachments,
  removeAttachment,
  fileInputRef,
  handleFileChange,
  slashMenuOpen,
  filteredCommands,
  slashIndex,
  executeCommand,
  impersonating,
  text,
  textareaRef,
  handleChange,
  handleKeyDown,
  onStop,
  handleSend,
}) {
  return (
    <>
      {/* 图片缩略图 */}
      <AttachmentThumbs attachments={attachments} removeAttachment={removeAttachment} />

      <div className="we-chat-input__row we-material">
        {/* 附件按钮 */}
        <IconButton
          label="添加图片附件（最多3张）"
          title="添加图片（最多3张）"
          onClick={() => fileInputRef.current?.click()}
          disabled={generating || attachments.length >= MAX_ATTACHMENTS_PER_MESSAGE}
        >
          <ImagePlus size={20} />
        </IconButton>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={handleFileChange}
        />

        {/* 输入框 */}
        <div className="we-chat-input__text-wrap">
          {/* Slash 命令浮层 */}
          {slashMenuOpen && (
            <SlashCommandMenu
              filteredCommands={filteredCommands}
              slashIndex={slashIndex}
              executeCommand={executeCommand}
            />
          )}

          {/* impersonate 构思中占位层（无用户输入时覆盖 placeholder） */}
          {impersonating && !text && (
            <div className="we-chat-impersonate-thinking">
              <MotionOrb size={18} />
              <span className="we-chat-impersonate-text">AI 正在构思</span>
            </div>
          )}

          <textarea
            ref={textareaRef}
            aria-label="消息输入"
            aria-expanded={slashMenuOpen}
            aria-controls={slashMenuOpen ? SLASH_LISTBOX_ID : undefined}
            aria-activedescendant={slashMenuOpen ? slashOptionId(slashIndex) : undefined}
            placeholder={impersonating && !text ? '' : '发送消息… (Shift+Enter 换行，/ 调出命令)'}
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            disabled={generating}
            rows={1}
            className="we-chat-textarea"
          />
        </div>

        {/* 发送 / 停止 */}
        {generating ? (
          <IconButton
            variant="primary"
            label="停止生成"
            onClick={onStop}
            className="we-chat-send-btn"
            {...m.gesture('sink')}
          >
            <Square size={16} fill="currentColor" />
          </IconButton>
        ) : (
          <IconButton
            variant="primary"
            label="发送消息"
            title="发送 (Enter)"
            onClick={handleSend}
            disabled={!text.trim()}
            className="we-chat-send-btn"
            {...m.gesture('sink', { disabled: !text.trim() })}
          >
            <ArrowUp size={20} strokeWidth={2} />
          </IconButton>
        )}
      </div>
    </>
  );
}
