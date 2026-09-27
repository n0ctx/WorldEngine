import { useImperativeHandle, useState } from 'react';

// 暴露命令式 fillText 给父组件；confirmOverwrite：已有内容时弹确认框，由用户决定是否覆盖
export default function useFillTextRef({ ref, text, setText, textareaRef }) {
  const [pendingFill, setPendingFill] = useState(null);

  useImperativeHandle(ref, () => ({
    fillText(value, opts = {}) {
      const { force = false, focus = false, confirmOverwrite = false } = opts;
      if (!force && text.trim()) {
        if (confirmOverwrite) setPendingFill(value);
        return false;
      }
      setText(value);
      if (focus) {
        setTimeout(() => textareaRef.current?.focus({ preventScroll: true }), 0);
      }
      return true;
    },
    hasText() {
      return text.trim().length > 0;
    },
  }), [text, setText, textareaRef]);

  return { pendingFill, setPendingFill };
}
