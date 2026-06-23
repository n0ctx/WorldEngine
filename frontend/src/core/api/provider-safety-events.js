/**
 * Provider Safety Events API
 *
 * 后端会在 SSE 流里推 `provider_safety_signal`（由 stream-parser 分发到
 * callbacks.onProviderSafetySignal），同时这里提供历史事件的查询接口。
 *
 * 同时维护一个轻量的全局事件总线：任何模块都可以通过
 * `subscribeProviderSafetySignals(cb)` 监听新到达的 signal（由聊天/写作流
 * 的 onProviderSafetySignal 回调里调用 publishProviderSafetySignal 触发）。
 */
import { request } from './request.js';

const listeners = new Set();

export function publishProviderSafetySignal(signal) {
  if (!signal) return;
  for (const cb of listeners) {
    try { cb(signal); } catch { /* swallow */ }
  }
}

export function subscribeProviderSafetySignals(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function listProviderSafetyEvents(filters = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v != null && v !== '') qs.append(k, String(v));
  }
  const suffix = qs.toString();
  return request(`/api/provider-safety-events${suffix ? `?${suffix}` : ''}`);
}

export function getProviderSafetyStats(filters = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v != null && v !== '') qs.append(k, String(v));
  }
  const suffix = qs.toString();
  return request(`/api/provider-safety-events/stats${suffix ? `?${suffix}` : ''}`);
}

export function getProviderSafetyEvent(id) {
  return request(`/api/provider-safety-events/${encodeURIComponent(id)}`);
}
