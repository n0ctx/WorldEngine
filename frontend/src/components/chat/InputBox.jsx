import { useState, useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { applyRules } from '../../core/utils/regex-runner.js';
import ConfirmModal from '../ui/ConfirmModal.jsx';
import { isImeComposing } from '../../core/utils/ime.js';
import { useMotion } from '../../core/hooks/useMotion.js';
import useChatDraft from './useChatDraft.js';
import useSlashCommands from './useSlashCommands.js';
import useImageAttachments from './useImageAttachments.js';
import InputBoxToolbar from './InputBoxToolbar.jsx';
import InputBoxComposer from './InputBoxComposer.jsx';

const InputBox = forwardRef(function InputBox({
  onSend,
  onStop,
  generating,
  impersonating,
  lastUserContent,
  worldId,
  sessionId,
  mode = 'chat',
  onContinue,
  onImpersonate,
  onRetry,
  onTitle,
  pagerSlot = null,
}, ref) {
  const m = useMotion();
  const [text, setText] = useState('');
  const textareaRef = useRef(null);
  const [pendingFill, setPendingFill] = useState(null);

  const { clearDraft } = useChatDraft({ mode, sessionId, text, setText });

  // 暴露命令式 fillText 给父组件
  useImperativeHandle(ref, () => ({
    // confirmOverwrite：已有内容时弹确认框，由用户决定是否覆盖
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
  }), [text]);
  const {
    slashIndex,
    filteredCommands,
    slashMenuOpen,
    syncSlashOpen,
    closeSlash,
    executeCommand,
    handleSlashKeyDown,
  } = useSlashCommands({
    text, generating, impersonating, onContinue, onImpersonate, onRetry, onTitle, setText, clearDraft,
  });
  const { attachments, setAttachments, fileInputRef, handleFileChange, removeAttachment } = useImageAttachments();

  // 自动调整高度（运行时动态值，保留）
  function adjustHeight() {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
  }

  useEffect(() => { adjustHeight(); }, [text]);

  // 生成期间输入框被禁用会丢焦点；结束后若焦点没被用户移到别处，交还给输入框
  const wasGeneratingRef = useRef(generating);
  useEffect(() => {
    const finished = wasGeneratingRef.current && !generating;
    wasGeneratingRef.current = generating;
    const active = document.activeElement;
    if (finished && (!active || active === document.body)) {
      textareaRef.current?.focus({ preventScroll: true });
    }
  }, [generating]);

  // 当输入变化时控制浮层
  function handleChange(e) {
    const val = e.target.value;
    setText(val);
    syncSlashOpen(val);
    adjustHeight();
  }

  function handleKeyDown(e) {
    if (isImeComposing(e)) return;
    if (handleSlashKeyDown(e)) return;

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    // 输入框为空时按 Up 键填入上一条 user 消息
    if (e.key === 'ArrowUp' && !text && lastUserContent) {
      e.preventDefault();
      setText(lastUserContent);
    }
  }

  function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || generating) return;
    // user_input scope：发送前应用正则替换
    const processed = applyRules(trimmed, 'user_input', worldId ?? null, mode);
    if (!processed.trim()) return;
    onSend(processed, attachments);
    setText('');
    setAttachments([]);
    closeSlash();
    clearDraft();
  }

  return (
    <div className="we-chat-input">
      {/* 顶部工具条：翻页（居中）+ 快捷动作（右侧） */}
      <InputBoxToolbar
        pagerSlot={pagerSlot}
        generating={generating}
        onContinue={onContinue}
        onImpersonate={onImpersonate}
      />

      <InputBoxComposer
        m={m}
        generating={generating}
        attachments={attachments}
        removeAttachment={removeAttachment}
        fileInputRef={fileInputRef}
        handleFileChange={handleFileChange}
        slashMenuOpen={slashMenuOpen}
        filteredCommands={filteredCommands}
        slashIndex={slashIndex}
        executeCommand={executeCommand}
        impersonating={impersonating}
        text={text}
        textareaRef={textareaRef}
        handleChange={handleChange}
        handleKeyDown={handleKeyDown}
        onStop={onStop}
        handleSend={handleSend}
      />

      <AnimatePresence>
        {pendingFill !== null && (
          <ConfirmModal
            title="覆盖输入框内容？"
            message="输入框已有内容，是否用 AI 代写结果覆盖？"
            confirmText="覆盖"
            cancelText="保留原内容"
            onConfirm={async () => {
              setText(pendingFill);
              setPendingFill(null);
              setTimeout(() => textareaRef.current?.focus({ preventScroll: true }), 0);
            }}
            onClose={() => setPendingFill(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
});

export default InputBox;
