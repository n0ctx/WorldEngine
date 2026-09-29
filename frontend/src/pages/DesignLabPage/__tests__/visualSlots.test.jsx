import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VISUAL_DEMOS } from '../visual/index.js';
import VisualTab from '../VisualTab.jsx';
import { SLOTS } from '../slots.js';
import { VISUAL_CATEGORIES, VISUAL_SLOTS, VISUAL_STATUS_LABEL } from '../visualSlots.js';

// 不归视觉位管的核心 token：内部基础色、结构量、运行时变量、固定色集，以及归动效一侧的时长与缓动
const SKIP_PREFIXES = [
  '--we-core-', '--we-z-', '--we-space-', '--we-range-', '--we-status-table-', '--we-worlds-',
  '--we-danmaku-', '--we-duration-', '--we-easing-', '--we-skeleton-',
];

// vitest 从 frontend/ 目录启动
function coreTokens() {
  const tokens = new Set();
  for (const file of ['tokens.css', 'fonts.css']) {
    const css = readFileSync(path.resolve(process.cwd(), 'src/themes', file), 'utf8');
    for (const match of css.matchAll(/^\s*(--we-[a-z0-9-]+)\s*:/gm)) tokens.add(match[1]);
  }
  return [...tokens].filter((token) => !SKIP_PREFIXES.some((prefix) => token.startsWith(prefix)));
}

function globToRegExp(glob) {
  return new RegExp(`^${glob.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
}

const TOKENS = coreTokens();
const GLOBS = [...new Set(VISUAL_SLOTS.flatMap((slot) => slot.tokens))];

describe('视觉位清单', () => {
  it('每个核心视觉 token 都被至少一个视觉位认领', () => {
    const unclaimed = TOKENS.filter((token) => !GLOBS.some((glob) => globToRegExp(glob).test(token)));
    expect(unclaimed).toEqual([]);
  });

  it('视觉位认领的 token 都真实存在，没有拼错', () => {
    const dead = GLOBS.filter((glob) => !TOKENS.some((token) => globToRegExp(glob).test(token)));
    expect(dead).toEqual([]);
  });

  it('id 在视觉与动效两份清单里都唯一，分类与状态都是已定义的值', () => {
    const ids = [...VISUAL_SLOTS, ...SLOTS].map((slot) => slot.id);
    expect(new Set(ids).size).toBe(ids.length);
    const categories = new Set(VISUAL_CATEGORIES.map((item) => item.id));
    for (const slot of VISUAL_SLOTS) {
      expect(categories.has(slot.category), slot.id).toBe(true);
      expect(VISUAL_STATUS_LABEL[slot.status], slot.id).toBeTruthy();
      expect(slot.usedIn.length, slot.id).toBeGreaterThan(0);
    }
  });

  it('ready 的视觉位必须有演示，演示都能对上视觉位', () => {
    const ids = new Set(VISUAL_SLOTS.map((slot) => slot.id));
    for (const id of Object.keys(VISUAL_DEMOS)) expect(ids.has(id), id).toBe(true);
    for (const slot of VISUAL_SLOTS.filter((item) => item.status === 'ready')) {
      expect(VISUAL_DEMOS[slot.id], slot.id).toBeTruthy();
    }
  });
});

describe('视觉分页', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} unobserve() {} });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('每个分类下的每个视觉位都渲染出标题', () => {
    render(<MemoryRouter><VisualTab /></MemoryRouter>);
    for (const category of VISUAL_CATEGORIES) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${category.label}`) }));
      for (const slot of VISUAL_SLOTS.filter((item) => item.category === category.id)) {
        expect(screen.getByRole('heading', { name: slot.title }), slot.id).toBeInTheDocument();
      }
    }
  });
});
