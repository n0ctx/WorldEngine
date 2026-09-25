import { useState } from 'react';
import { isImeComposing } from '../utils/ime.js';

/**
 * 消息气泡的就地编辑状态：用户消息 Enter 提交、Esc 取消；AI 消息 Esc 取消，内容有变化才提交
 */
export function useMessageEditing(message, { onEdit, onEditAssistant }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [editingAI, setEditingAI] = useState(false);
  const [aiDraft, setAiDraft] = useState('');

  function startEdit() { setDraft(message.content); setEditing(true); }
  function confirmEdit() {
    const trimmed = draft.trim();
    if (trimmed) onEdit?.(message.id, trimmed);
    setEditing(false);
  }
  function cancelEdit() { setEditing(false); }
  function handleKeyDown(e) {
    if (isImeComposing(e)) return;
    if (e.key === 'Escape') cancelEdit();
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); confirmEdit(); }
  }

  function startEditAI() { setAiDraft(message.content); setEditingAI(true); }
  function confirmEditAI() {
    if (aiDraft.trim() && aiDraft !== message.content) onEditAssistant?.(message.id, aiDraft.trim());
    setEditingAI(false);
  }
  function cancelEditAI() { setEditingAI(false); }
  function handleKeyDownAI(e) { if (e.key === 'Escape') cancelEditAI(); }

  return {
    editing, draft, setDraft, startEdit, confirmEdit, cancelEdit, handleKeyDown,
    editingAI, aiDraft, setAiDraft, startEditAI, confirmEditAI, cancelEditAI, handleKeyDownAI,
  };
}
