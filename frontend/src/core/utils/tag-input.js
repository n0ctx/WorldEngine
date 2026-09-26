import { isImeComposing } from './ime.js';

export function handleTagInputKeyDown(event, input, values, add, remove) {
  if (isImeComposing(event)) return;
  if (event.key === 'Enter') {
    event.preventDefault();
    add(input);
  } else if (event.key === 'Backspace' && input === '' && values.length) {
    remove(values[values.length - 1]);
  }
}
