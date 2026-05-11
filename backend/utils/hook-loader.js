import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { registerHook, listHooks } from '../hooks/hook-registry.js';
import { createLogger } from './logger.js';

const log = createLogger('hook-loader');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOOKS_DIR = path.resolve(__dirname, '..', '..', 'hooks');
let loadPromise = null;

export function loadUserHooks() {
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    if (!fs.existsSync(HOOKS_DIR)) return;

    const files = fs.readdirSync(HOOKS_DIR)
      .filter((f) => f.endsWith('.js'))
      .sort();

    if (files.length === 0) return;

    let loaded = 0;
    for (const file of files) {
      const filePath = path.join(HOOKS_DIR, file);
      try {
        const mod = await import(pathToFileURL(filePath).href);
        if (typeof mod.default !== 'function') {
          log.warn(`hook-loader: ${file} 没有默认导出函数，跳过`);
          continue;
        }
        mod.default({ registerHook });
        loaded++;
      } catch (err) {
        log.warn(`hook-loader: 加载 ${file} 失败 — ${err.message}`);
      }
    }

    const summary = [...listHooks().entries()]
      .map(([e, n]) => `${e}×${n}`)
      .join(', ');
    log.info(`用户 hook 加载完成：${loaded} 个文件${summary ? `，已注册 [${summary}]` : ''}`);
  })();

  return loadPromise;
}
