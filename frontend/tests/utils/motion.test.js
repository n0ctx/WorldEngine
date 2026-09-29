import { describe, expect, it } from 'vitest';

import { DURATION, EASE, GESTURE, SIGNAL, STAGGER, transitions, variants } from '../../src/core/utils/motion.js';

describe('motion utils', () => {
  it('导出稳定的动效 token 和预组合配置', () => {
    expect(DURATION.instant).toBe(0);
    expect(EASE.linear).toBe('linear');
    expect(STAGGER.list).toBeGreaterThan(0);
    expect(transitions.ink.duration).toBe(DURATION.base);
    expect(transitions.quick.ease).toBe(EASE.sharp);
  });

  it('硬切与分格缓动：段内保持起点，段尾到达终点', () => {
    expect(EASE.cut(0)).toBe(0);
    expect(EASE.cut(0.99)).toBe(0);
    expect(EASE.cut(1)).toBe(1);
    expect(EASE.stepped(0.3)).toBe(0.25);
    expect(EASE.stepped(0.99)).toBe(0.75);
    expect(EASE.stepped(1)).toBe(1);
  });

  it('信号锁定：闪两下、抖一下后落在静止态，时长复用 DURATION 档位', () => {
    const { hidden, visible, exit } = variants.signalIn;
    expect(hidden.opacity).toBe(0);
    expect(visible.opacity.at(-1)).toBe(1);
    expect(visible.x.at(-1)).toBe(0);
    expect(exit.opacity.at(-1)).toBe(0);
    expect(transitions.signal).toEqual({ duration: SIGNAL.enter, ease: EASE.cut });
    expect(SIGNAL.enter).toBe(DURATION.base);
    expect(SIGNAL.exit).toBe(DURATION.quick);
  });

  it('手势只含目标值不含 transition，按下是压缩或陷落', () => {
    for (const key of Object.keys(GESTURE)) {
      expect(GESTURE[key].transition).toBeUndefined();
    }
    expect(GESTURE.press.whileTap.scale).toBeLessThan(1);
    expect(GESTURE.portal.whileTap.scale).toBeLessThan(1);
    expect(GESTURE.sink.whileTap.y).toBeGreaterThan(0);
    expect(GESTURE.portal.whileHover).toEqual({ y: expect.any(Number) });
  });
});
