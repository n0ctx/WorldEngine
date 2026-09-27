import { useRef, useState } from 'react';
import { log } from '../../core/utils/logger.js';
import { MAX_ATTACHMENTS_PER_MESSAGE, MAX_ATTACHMENT_SIZE_MB } from '../../core/utils/constants.js';

export default function useImageAttachments() {
  const [attachments, setAttachments] = useState([]);
  const fileInputRef = useRef(null);

  function handleFileChange(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    const MAX_SIZE = MAX_ATTACHMENT_SIZE_MB * 1024 * 1024;

    const remaining = MAX_ATTACHMENTS_PER_MESSAGE - attachments.length;
    const selected = files.slice(0, remaining);
    const oversized = [];
    const unreadable = [];

    const readers = selected.map(
      (file) =>
        new Promise((resolve) => {
          if (file.size > MAX_SIZE) {
            oversized.push(file.name);
            resolve(null);
            return;
          }
          const reader = new FileReader();
          reader.onload = (ev) => {
            const base64 = ev.target.result.split(',')[1];
            resolve({ type: 'image', data: base64, mimeType: file.type, preview: ev.target.result });
          };
          reader.onerror = () => {
            unreadable.push(file.name);
            resolve(null);
          };
          reader.readAsDataURL(file);
        }),
    );

    Promise.all(readers).then((results) => {
      const valid = results.filter(Boolean);
      if (oversized.length) {
        log.error('chat.image.too_large', null, { toast: `以下图片超过 ${MAX_ATTACHMENT_SIZE_MB}MB，已跳过：${oversized.join(', ')}` });
      }
      if (unreadable.length) {
        log.error('chat.image.read_failed', null, { toast: `以下图片无法读取，已跳过：${unreadable.join(', ')}` });
      }
      if (valid.length) {
        setAttachments((prev) => [...prev, ...valid]);
      }
    });
  }

  function removeAttachment(i) {
    setAttachments((prev) => prev.filter((_, idx) => idx !== i));
  }

  return { attachments, setAttachments, fileInputRef, handleFileChange, removeAttachment };
}
