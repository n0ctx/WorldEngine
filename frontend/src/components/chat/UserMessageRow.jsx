import { motion } from 'framer-motion';
import SeamlessEditableSurface from '../../../../shared/SeamlessEditableSurface.jsx';
import { CopyButton, DeleteButton, EditButton, EditConfirmActions } from '../message/MessageActions.jsx';
import { AttachmentThumbnail, MarkdownContent, MessageTime } from './MessageItemShared.jsx';

const MotionDiv = motion.div;

export default function UserMessageRow({
  message,
  speakerName,
  displayContent,
  editing,
  draft,
  setDraft,
  handleKeyDown,
  cancelEdit,
  confirmEdit,
  startEdit,
  onDelete,
  enterProps,
}) {
  return (
    <MotionDiv
      data-message-id={message?.id}
      className="we-message-row we-message-user"
      {...enterProps}
    >
      <div className="we-message-row-inner">
        <div className="we-message-body">
          <div className="we-message-label">
            {speakerName}
          </div>
          <div className={`we-message-bubble-user${editing ? ' we-message-bubble--editing' : ''}`}>
            <SeamlessEditableSurface
              editing={editing}
              selectEnd
              trackValue={draft}
              readClassName="we-message-content"
              renderRead={() => <MarkdownContent>{displayContent}</MarkdownContent>}
              renderEditor={({ editorRef, syncLayout }) => (
                <textarea
                  ref={editorRef}
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    syncLayout();
                  }}
                  onKeyDown={handleKeyDown}
                  rows={1}
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
          <div className="we-message-actions">
            {editing ? (
              <EditConfirmActions onCancel={cancelEdit} onConfirm={confirmEdit} confirmLabel="确认" />
            ) : (
              <>
                <MessageTime createdAt={message.created_at} />
                <CopyButton getText={() => message.content} />
                <EditButton onClick={startEdit} />
                {onDelete && <DeleteButton onDelete={() => onDelete(message.id)} />}
              </>
            )}
          </div>
        </div>
      </div>
    </MotionDiv>
  );
}
