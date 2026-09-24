import { useState, useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { motion } from 'framer-motion';
import { applyRules } from '../../core/utils/regex-runner.js';
import { ArrowDownToLine, ArrowUp, BookMarked, FastForward, ImagePlus, Square, Table2, UserRoundPen, X } from 'lucide-react';
import ConfirmModal from '../ui/ConfirmModal.jsx';
import { log } from '../../core/utils/logger.js';
import { isImeComposing } from '../../core/utils/ime.js';
import { MAX_ATTACHMENTS_PER_MESSAGE, MAX_ATTACHMENT_SIZE_MB } from '../../core/utils/constants.js';
import { useMotion } from '../../core/hooks/useMotion.js';

const SLASH_COMMANDS = [
  { cmd: '/continue',    desc: '续写上一条 AI 回复' },
  { cmd: '/impersonate', desc: 'AI 替你写一条消息' },
  { cmd: '/retry',       desc: '删除最后一条 AI 回复并重新生成' },
  { cmd: '/title',       desc: '根据最近对话上下文重新生成会话标题' },
];

const SLASH_LISTBOX_ID = 'we-chat-slash-listbox';
const slashOptionId = (i) => `${SLASH_LISTBOX_ID}-${i}`;

const InputBox = forwardRef(function InputBox({
  onSend,
  onStop,
  generating,
  impersonating,
  lastUserContent,
  worldId,
  sessionId,
  mode = 'chat',
  onScrollToBottom,
  onContinue,
  onImpersonate,
  onRetry,
  onTitle,
  onLongTermMemory = null,
  onTableMemory = null,
  pagerSlot = null,
}, ref) {
  const m = useMotion();
  const press = m.gesture('press');
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const [pendingFill, setPendingFill] = useState(null);
  const draftKey = `we:chat-draft:${mode}:${sessionId || globalThis.location?.pathname || ''}`;

  useEffect(() => {
    try {
      const savedDraft = sessionStorage.getItem(draftKey);
      if (savedDraft) setText(savedDraft);
    } catch {
      // ignore draft restore failures
    }
  }, [draftKey]);

  useEffect(() => {
    try {
      if (text) sessionStorage.setItem(draftKey, text);
      else sessionStorage.removeItem(draftKey);
    } catch {
      // ignore draft persistence failures
    }
  }, [draftKey, text]);

  function clearDraft() {
    try {
      sessionStorage.removeItem(draftKey);
    } catch {
      // ignore draft cleanup failures
    }
  }

  function canExecuteCommand(cmd) {
    if (generating) return false;
    if (impersonating && cmd === '/impersonate') return false;
    return true;
  }

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

  // 过滤命令列表
  const filteredCommands = text.startsWith('/')
    ? SLASH_COMMANDS.filter((c) => c.cmd.startsWith(text.toLowerCase().trim()))
    : [];
  const slashMenuOpen = slashOpen && filteredCommands.length > 0;

  // 当输入变化时控制浮层
  function handleChange(e) {
    const val = e.target.value;
    setText(val);
    if (val.startsWith('/')) {
      setSlashOpen(true);
      setSlashIndex(0);
    } else {
      setSlashOpen(false);
    }
    adjustHeight();
  }

  function executeCommand(cmd) {
    if (!canExecuteCommand(cmd)) return;
    setText('');
    setSlashOpen(false);
    clearDraft();
    switch (cmd) {
      case '/continue':    onContinue?.();    break;
      case '/impersonate': onImpersonate?.(); break;
      case '/retry':       onRetry?.();       break;
      case '/title':       onTitle?.();       break;
    }
  }

  function handleKeyDown(e) {
    if (isImeComposing(e)) return;
    // Slash 命令浮层键盘导航
    if (slashMenuOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashIndex((i) => (i + 1) % filteredCommands.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashIndex((i) => (i - 1 + filteredCommands.length) % filteredCommands.length);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        executeCommand(filteredCommands[slashIndex].cmd);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSlashOpen(false);
        return;
      }
    }

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
    setSlashOpen(false);
    clearDraft();
  }

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

  // 点击工具条按钮时不让输入框失焦；动作本身走 onClick，键盘 Enter/Space 同样可触发
  function keepInputFocus(e) {
    e.preventDefault();
  }

  function removeAttachment(i) {
    setAttachments((prev) => prev.filter((_, idx) => idx !== i));
  }

  return (
    <div className="we-chat-input">
      {/* 顶部工具条：翻页（居中）+ 快捷动作（右侧） */}
      <div className="we-chat-input__toolbar">
        <div className="we-chat-input__toolbar-pager">{pagerSlot}</div>
        <div className="we-chat-quick-actions">
          <motion.button
            type="button"
            onMouseDown={keepInputFocus}
            onClick={() => onScrollToBottom?.()}
            className="we-chat-quick-btn"
            title="跳转到底部"
            aria-label="跳转到底部"
            {...press}
          >
            <ArrowDownToLine size={20} />
          </motion.button>
          <motion.button
            type="button"
            onMouseDown={keepInputFocus}
            onClick={() => onContinue?.()}
            disabled={generating}
            className="we-chat-quick-btn"
            title="续写上一条 AI 回复"
            aria-label="续写上一条 AI 回复"
            {...m.gesture('press', { disabled: generating })}
          >
            <FastForward size={20} fill="currentColor" fillOpacity={0.22} />
          </motion.button>
          <motion.button
            type="button"
            onMouseDown={keepInputFocus}
            onClick={() => onImpersonate?.()}
            disabled={generating}
            className="we-chat-quick-btn"
            title="AI 替你写一条消息"
            aria-label="AI 替你写一条消息"
            {...m.gesture('press', { disabled: generating })}
          >
            <UserRoundPen size={20} />
          </motion.button>
          {onLongTermMemory && (
            <motion.button
              type="button"
              onMouseDown={keepInputFocus}
              onClick={() => onLongTermMemory()}
              className="we-chat-quick-btn"
              title="长期记忆"
              aria-label="长期记忆"
              {...press}
            >
              <BookMarked size={20} />
            </motion.button>
          )}
          {onTableMemory && (
            <motion.button
              type="button"
              onMouseDown={keepInputFocus}
              onClick={() => onTableMemory()}
              className="we-chat-quick-btn"
              title="表格记忆"
              aria-label="表格记忆"
              {...press}
            >
              <Table2 size={20} />
            </motion.button>
          )}
        </div>
      </div>

      {/* 图片缩略图 */}
      {attachments.length > 0 && (
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
      )}

      <div className="we-chat-input__row we-material">
        {/* 附件按钮 */}
        <motion.button
          onClick={() => fileInputRef.current?.click()}
          disabled={generating || attachments.length >= MAX_ATTACHMENTS_PER_MESSAGE}
          className="we-chat-input__attach-btn"
          title="添加图片（最多3张）"
          aria-label="添加图片附件（最多3张）"
          {...m.gesture('press', { disabled: generating || attachments.length >= MAX_ATTACHMENTS_PER_MESSAGE })}
        >
          <ImagePlus size={20} />
        </motion.button>
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
            <div id={SLASH_LISTBOX_ID} role="listbox" aria-label="命令" className="we-chat-slash-dropdown">
              {filteredCommands.map((c, i) => (
                <button
                  key={c.cmd}
                  id={slashOptionId(i)}
                  type="button"
                  role="option"
                  aria-selected={i === slashIndex}
                  tabIndex={-1}
                  onMouseDown={(e) => { e.preventDefault(); executeCommand(c.cmd); }}
                  className={`we-chat-slash-item${i === slashIndex ? ' we-chat-slash-item--active' : ''}`}
                >
                  <span className="we-chat-slash-item__cmd">{c.cmd}</span>
                  <span className="we-chat-slash-item__desc">{c.desc}</span>
                </button>
              ))}
            </div>
          )}

          {/* impersonate 构思中占位层（无用户输入时覆盖 placeholder） */}
          {impersonating && !text && (
            <div className="we-chat-impersonate-thinking">
              <span className="we-impersonate-thinking we-chat-impersonate-text">AI 正在构思</span>
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
          <motion.button
            onClick={onStop}
            className="we-chat-send-btn"
            title="停止生成"
            aria-label="停止生成"
            {...m.gesture('sink')}
          >
            <Square size={16} fill="currentColor" />
          </motion.button>
        ) : (
          <motion.button
            onClick={handleSend}
            disabled={!text.trim()}
            className="we-chat-send-btn"
            title="发送 (Enter)"
            aria-label="发送消息"
            {...m.gesture('sink', { disabled: !text.trim() })}
          >
            <ArrowUp size={20} strokeWidth={2} />
          </motion.button>
        )}
      </div>

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
    </div>
  );
});

export default InputBox;
