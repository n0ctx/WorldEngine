import { useEffect } from 'react';

export default function useChatDraft({ mode, sessionId, text, setText }) {
  const draftKey = `we:chat-draft:${mode}:${sessionId || globalThis.location?.pathname || ''}`;

  useEffect(() => {
    try {
      const savedDraft = sessionStorage.getItem(draftKey);
      if (savedDraft) setText(savedDraft);
    } catch {
      // ignore draft restore failures
    }
  }, [draftKey, setText]);

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

  return { clearDraft };
}
