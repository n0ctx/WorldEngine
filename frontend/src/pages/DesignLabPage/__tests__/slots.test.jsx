import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MOTION_PACKS } from '../../../core/motion/motionPack.js';
import { DEMOS } from '../demos/index.js';
import MotionTab from '../MotionTab.jsx';
import { CATEGORIES, SLOTS, STATUS_LABEL } from '../slots.js';

// 动效包对外暴露的全部接口，写成与 slots.js 里 api 相同的记法
function packApis(pack) {
  const apis = ['flow', 'stream', 'fx', 'role'];
  for (const key of Object.keys(pack.variants)) apis.push(`variant:${key}`);
  for (const key of Object.keys(pack.transitions)) apis.push(`transition:${key}`);
  for (const key of Object.keys(pack.gestures)) apis.push(`gesture:${key}`);
  return apis;
}

// vitest 从 frontend/ 目录启动
const readPackCss = (name) => readFileSync(path.resolve(process.cwd(), `src/themes/motion/${name}.css`), 'utf8');

function packCssApis(css) {
  return [...css.matchAll(/^\s*--we-fx-([a-z]+)\s*:/gm)].map((match) => `css:${match[1]}`);
}

// 动效包样式选择器里出现的核心类，按 BEM 块名归并
function packCssHooks(css) {
  const selectors = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{};]+)\{/g)].map((match) => match[1]);
  return selectors.flatMap((selector) => [...selector.matchAll(/\.(we-[a-z0-9_-]+)/g)].map((match) => match[1].replace(/(__|--).*$/, '')));
}

const PACK_APIS = Object.values(MOTION_PACKS).map((pack) => new Set(packApis(pack)));
const PACK_HOOKS = new Set(Object.keys(MOTION_PACKS).flatMap((id) => packCssHooks(readPackCss(id))));
const CLAIMED_HOOKS = SLOTS.flatMap((slot) => slot.hooks ?? []);
const CSS_APIS = Object.keys(MOTION_PACKS).map((id) => new Set(packCssApis(readPackCss(id))));
const ALL_APIS = new Set([...PACK_APIS, ...CSS_APIS].flatMap((set) => [...set]));
const CLAIMED = new Set(SLOTS.flatMap((slot) => slot.api));

describe('动效位清单', () => {
  it('每个动效包的每个接口都被至少一个动效位引用', () => {
    const missing = [...ALL_APIS].filter((api) => !CLAIMED.has(api));
    expect(missing).toEqual([]);
  });

  it('动效位声明的接口都真实存在，没有拼错', () => {
    const unknown = [...CLAIMED].filter((api) => !ALL_APIS.has(api));
    expect(unknown).toEqual([]);
  });

  it('动效包样式接管的每个核心类都被某个动效位的 hooks 认领，认领的类都真的被接管', () => {
    expect([...PACK_HOOKS].filter((name) => !CLAIMED_HOOKS.includes(name)).sort()).toEqual([]);
    expect(CLAIMED_HOOKS.filter((name) => !PACK_HOOKS.has(name))).toEqual([]);
    expect(new Set(CLAIMED_HOOKS).size).toBe(CLAIMED_HOOKS.length);
  });

  it('两个动效包对外接口一致', () => {
    const [first, ...rest] = PACK_APIS;
    for (const other of rest) expect([...other].sort()).toEqual([...first].sort());
    const [firstCss, ...restCss] = CSS_APIS;
    for (const other of restCss) expect([...other].sort()).toEqual([...firstCss].sort());
  });

  it('id 唯一，分类与状态都是已定义的值', () => {
    const ids = SLOTS.map((slot) => slot.id);
    expect(new Set(ids).size).toBe(ids.length);
    const categories = new Set(CATEGORIES.map((item) => item.id));
    for (const slot of SLOTS) {
      expect(categories.has(slot.category), slot.id).toBe(true);
      expect(STATUS_LABEL[slot.status], slot.id).toBeTruthy();
      expect(slot.usedIn.length, slot.id).toBeGreaterThan(0);
    }
  });

  it('走动效包的动效位必须有演示，演示都能对上动效位', () => {
    const ids = new Set(SLOTS.map((slot) => slot.id));
    for (const id of Object.keys(DEMOS)) expect(ids.has(id), id).toBe(true);
    for (const slot of SLOTS.filter((item) => item.status === 'pack')) {
      expect(DEMOS[slot.id], slot.id).toBeTruthy();
    }
  });
});

describe('动效分页', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} unobserve() {} });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('每个分类下的每个动效位都渲染出标题、接口和用在哪', () => {
    render(<MemoryRouter><MotionTab /></MemoryRouter>);
    for (const category of CATEGORIES) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${category.label}`) }));
      for (const slot of SLOTS.filter((item) => item.category === category.id)) {
        expect(screen.getByRole('heading', { name: slot.title }), slot.id).toBeInTheDocument();
      }
    }
  });
});
