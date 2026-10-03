import { useState } from 'react';

const SLASH_COMMANDS = [
  { cmd: '/continue',    desc: '续写上一条 AI 回复' },
  { cmd: '/impersonate', desc: 'AI 替你写一条消息' },
  { cmd: '/retry',       desc: '删除最后一条 AI 回复并重新生成' },
  { cmd: '/title',       desc: '根据最近对话上下文重新生成故事线标题' },
];

export const SLASH_LISTBOX_ID = 'we-chat-slash-listbox';
export const slashOptionId = (i) => `${SLASH_LISTBOX_ID}-${i}`;

export default function useSlashCommands({
  text,
  generating,
  impersonating,
  onContinue,
  onImpersonate,
  onRetry,
  onTitle,
  setText,
  clearDraft,
}) {
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);

  function canExecuteCommand(cmd) {
    if (generating) return false;
    if (impersonating && cmd === '/impersonate') return false;
    return true;
  }

  // 过滤命令列表
  const filteredCommands = text.startsWith('/')
    ? SLASH_COMMANDS.filter((c) => c.cmd.startsWith(text.toLowerCase().trim()))
    : [];
  const slashMenuOpen = slashOpen && filteredCommands.length > 0;

  // 当输入变化时控制浮层
  function syncSlashOpen(val) {
    if (val.startsWith('/')) {
      setSlashOpen(true);
      setSlashIndex(0);
    } else {
      setSlashOpen(false);
    }
  }

  function closeSlash() {
    setSlashOpen(false);
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

  // Slash 命令浮层键盘导航；返回是否已处理该按键
  function handleSlashKeyDown(e) {
    if (!slashMenuOpen) return false;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSlashIndex((i) => (i + 1) % filteredCommands.length);
      return true;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSlashIndex((i) => (i - 1 + filteredCommands.length) % filteredCommands.length);
      return true;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      executeCommand(filteredCommands[slashIndex].cmd);
      return true;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setSlashOpen(false);
      return true;
    }
    return false;
  }

  return {
    slashIndex,
    filteredCommands,
    slashMenuOpen,
    syncSlashOpen,
    closeSlash,
    executeCommand,
    handleSlashKeyDown,
  };
}
