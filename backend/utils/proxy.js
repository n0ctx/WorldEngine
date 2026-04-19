/**
 * 代理工具 — 统一管理 Node.js fetch 全局代理
 *
 * Node.js 25 内置 fetch 与 node_modules/undici 是两个独立实例，
 * setGlobalDispatcher 只对同一包的 fetch 生效。
 * 解决方案：用 undici 包的 fetch 替换 globalThis.fetch，确保同一 dispatcher 生效。
 */
import { ProxyAgent, Agent, setGlobalDispatcher, fetch as undiciFetch } from 'undici';

// 替换内置 fetch，让 setGlobalDispatcher 能控制所有 fetch 调用
globalThis.fetch = undiciFetch;

export function applyProxy(proxyUrl) {
  if (proxyUrl && proxyUrl.trim()) {
    setGlobalDispatcher(new ProxyAgent(proxyUrl.trim()));
    console.log(`[proxy] enabled: ${proxyUrl.trim()}`);
  } else {
    setGlobalDispatcher(new Agent());
    console.log('[proxy] disabled');
  }
}
