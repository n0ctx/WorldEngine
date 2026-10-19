// 服务商归类：本地服务、云端适配器，以及测试与性能复现用的 mock
import { isCloudProvider } from './cloud-router.js';

const LOCAL_PROVIDERS = new Set(['ollama', 'lmstudio', 'llamacpp']);

export function isLocalProvider(provider) {
  return LOCAL_PROVIDERS.has(provider);
}

export function isSupportedProvider(provider) {
  return provider === 'mock' || isLocalProvider(provider) || isCloudProvider(provider);
}
