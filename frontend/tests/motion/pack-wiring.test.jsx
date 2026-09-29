import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import MotionOrb from '../../src/components/motion/MotionOrb.jsx';
import { DEFAULT_MOTION_PACK_ID, MOTION_PACKS, setMotionPack } from '../../src/core/motion/motionPack.js';

// vitest 从 frontend/ 目录启动
const fromRoot = (...parts) => path.resolve(process.cwd(), ...parts);

describe('动效包接入点：新增一个包时，漏接的地方在这里失败', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });

  afterEach(() => {
    cleanup();
    setMotionPack(DEFAULT_MOTION_PACK_ID);
    vi.restoreAllMocks();
  });

  it('后端配置认的动效包 id 与前端注册的包一致（否则用户选了新包，保存时被静默改回默认包）', () => {
    const source = readFileSync(fromRoot('..', 'backend', 'services', 'config.js'), 'utf8');
    const declared = source.match(/const MOTION_PACK_IDS = \[([^\]]*)\]/)?.[1] ?? '';
    const backendIds = [...declared.matchAll(/'([\w-]+)'/g)].map((match) => match[1]);
    expect(backendIds.sort()).toEqual(Object.keys(MOTION_PACKS).sort());
  });

  it('每个包都有同名的样式文件 themes/motion/<id>.css（main.jsx 按目录自动引入）', () => {
    for (const id of Object.keys(MOTION_PACKS)) {
      expect(existsSync(fromRoot('src', 'themes', 'motion', `${id}.css`)), id).toBe(true);
    }
  });

  it('每个包声明的特性取值合法，思考小球都能渲染出来', () => {
    for (const pack of Object.values(MOTION_PACKS)) {
      expect(typeof pack.traits.neck, pack.id).toBe('boolean');
      expect(typeof pack.traits.warp, pack.id).toBe('boolean');
      expect(['stretch', 'hop'], pack.id).toContain(pack.traits.rail);
      setMotionPack(pack.id);
      const { container, unmount } = render(<MotionOrb size={24} />);
      expect(container.firstChild, pack.id).not.toBeNull();
      unmount();
    }
  });
});
