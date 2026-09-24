// frontend/src/core/utils/ime.js
/**
 * 键盘事件是否发生在输入法组合（中文拼音选字等）期间。
 * 组合期间的 Enter 是确认候选词、Escape 是取消组合，不应被当作提交 / 关闭。
 * Safari 在确认候选词的那次 keydown 上 isComposing 已为 false，只能靠 keyCode 229 识别。
 *
 * @param {KeyboardEvent | import('react').KeyboardEvent} e
 */
export function isImeComposing(e) {
  const native = e.nativeEvent ?? e;
  return native.isComposing || native.keyCode === 229;
}
