import { isImeComposing } from './ime.js';

export function handleInlineRenameKeyDown(event, confirmEdit, cancelEdit, stopPropagation = false) {
  if (stopPropagation) event.stopPropagation();
  if (isImeComposing(event)) return;
  if (event.key === 'Enter') { event.preventDefault(); confirmEdit(); }
  if (event.key === 'Escape') cancelEdit();
}
