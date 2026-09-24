import '@testing-library/jest-dom/vitest';
import './helpers/react.js';

// jsdom 没有 PointerEvent；framer-motion 的 whileTap 在键盘 Enter/Space 触发时会构造它
if (typeof globalThis.PointerEvent === 'undefined') {
  globalThis.PointerEvent = class PointerEvent extends MouseEvent {};
}
