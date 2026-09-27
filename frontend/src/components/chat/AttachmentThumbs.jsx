import { X } from 'lucide-react';

export default function AttachmentThumbs({ attachments, removeAttachment }) {
  if (attachments.length === 0) return null;
  return (
    <div className="we-chat-input__attachments">
      {attachments.map((att, i) => (
        <div key={i} className="we-chat-input__attachment-item">
          <img
            src={att.preview}
            alt={`附件图片 ${i + 1}`}
            className="we-chat-input__attachment-img"
          />
          <button
            type="button"
            onClick={() => removeAttachment(i)}
            aria-label={`移除第 ${i + 1} 张图片`}
            className="we-chat-input__attachment-remove"
          >
            <X size={12} strokeWidth={2.25} />
          </button>
        </div>
      ))}
    </div>
  );
}
