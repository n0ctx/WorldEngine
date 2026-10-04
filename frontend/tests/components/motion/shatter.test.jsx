import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import SlugText from '../../../src/components/motion/SlugText.jsx';
import { launch, shatterCard, stepShard } from '../../../src/components/motion/shatter.js';
import { setMotionPack } from '../../../src/core/motion/motionPack.js';
import { endPortal, getPortal, startPortal, subscribePortal } from '../../../src/core/motion/portal.js';

const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
const steady = () => 0.5;

describe('拆版', () => {
  afterEach(() => {
    cleanup();
    setMotionPack('liquid');
    endPortal();
  });

  it('只有 traits.shatter 的包把字拆成一颗颗铅字', () => {
    setMotionPack('liquid');
    const plain = render(<h3><SlugText text="雨夜" /></h3>);
    expect(plain.container.querySelectorAll('.we-slug-char')).toHaveLength(0);
    expect(plain.container.textContent).toBe('雨夜');
    cleanup();

    setMotionPack('letterpress');
    const { container } = render(<h3><SlugText text="雨夜雨" /></h3>);
    const chars = [...container.querySelectorAll('.we-slug-char')];
    expect(chars.map((node) => node.textContent)).toEqual(['雨', '夜', '雨']);
    expect(chars[2].style.getPropertyValue('--i')).toBe('2');
  });

  it('世界卡切成方铅块并带上名字的铅字，碎块落在卡片原处；离点下处越近崩得越猛、越早', () => {
    const card = document.createElement('div');
    card.innerHTML = '<h3><span class="we-slug-char">雨</span><span class="we-slug-char">夜</span></h3>';
    document.body.append(card);
    vi.spyOn(card, 'getBoundingClientRect').mockReturnValue(rect(100, 50, 180, 120));
    const [first, second] = card.querySelectorAll('.we-slug-char');
    vi.spyOn(first, 'getBoundingClientRect').mockReturnValue(rect(120, 140, 20, 24));
    vi.spyOn(second, 'getBoundingClientRect').mockReturnValue(rect(140, 140, 20, 24));

    const shards = shatterCard(card, { clientX: 100, clientY: 50 }, steady);
    const tiles = shards.filter((shard) => shard.kind === 'tile');
    const slugs = shards.filter((shard) => shard.kind === 'slug');
    expect(tiles).toHaveLength(9 * 6);
    expect(tiles[0]).toMatchObject({ x: 100, y: 50 });
    expect(slugs.map((shard) => [shard.ch, shard.x, shard.y])).toEqual([['雨', 120, 140], ['夜', 140, 140]]);
    // 没有封面时按强调色深浅铺色
    expect(tiles[0].style['--shard-tone']).toMatch(/^var\(--we-alpha-/);

    const near = launch(10, 10, { x: 0, y: 0, reach: 200 }, false, steady);
    const far = launch(190, 190, { x: 0, y: 0, reach: 200 }, false, steady);
    expect(near.vy).toBeLessThan(far.vy);
    expect(near.wait).toBeLessThan(far.wait);
    expect(near.vx).toBeGreaterThan(0);
    card.remove();
  });

  it('碎块带重力下落，开头撞到底边会弹一下，之后底边撤掉、掉出画面', () => {
    const body = { x: 0, y: 90, w: 10, h: 10, vx: 0, vy: 400, vr: 0, r: 0, wait: 0 };
    stepShard(body, 0.1, 0.05, 100);
    expect(body.y).toBe(90);
    expect(body.vy).toBeLessThan(0);
    const late = { x: 0, y: 95, w: 10, h: 10, vx: 0, vy: 400, vr: 0, r: 0, wait: 0 };
    stepShard(late, 1, 0.05, 100);
    expect(late.y).toBeGreaterThan(100);
    const waiting = { x: 0, y: 0, w: 10, h: 10, vx: 50, vy: 0, vr: 0, r: 0, wait: 0.2 };
    stepShard(waiting, 0.1, 0.05, 100);
    expect(waiting).toMatchObject({ x: 0, y: 0 });
  });

  it('转场仓库带着起点交给遮罩的细节，收定后回到 null', () => {
    const listener = vi.fn();
    const unsubscribe = subscribePortal(listener);
    expect(getPortal()).toBeNull();
    const shards = [{ kind: 'tile' }];
    startPortal({ worldId: 'w1', shards });
    expect(getPortal()).toEqual({ worldId: 'w1', shards });
    endPortal();
    expect(getPortal()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });
});
