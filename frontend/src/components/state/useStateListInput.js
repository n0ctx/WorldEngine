import { useState } from 'react';

export const STATE_LIST_MAX_ITEMS = 10;

/** 列表型状态字段的标签输入：去重、限制条数，变更后交给 applyItems 写回 */
export function useStateListInput(items, applyItems) {
  const [input, setInput] = useState('');

  function addItem(raw) {
    const value = raw.trim();
    if (!value || items.includes(value) || items.length >= STATE_LIST_MAX_ITEMS) return;
    setInput('');
    applyItems([...items, value]);
  }

  function removeItem(value) {
    setInput('');
    applyItems(items.filter((item) => item !== value));
  }

  return { input, setInput, addItem, removeItem, atMax: items.length >= STATE_LIST_MAX_ITEMS };
}
