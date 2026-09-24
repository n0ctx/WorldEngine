// 全局设置：读取时隐去密钥，写入时只接受局部补丁并拒绝密钥字段。

import { getConfig } from '../../../backend/services/config.js';

import { normalizeProposal, applyProposal } from '../normalize-proposal.js';
import { fail, requireObjectKeys } from './common.js';

const SECRET_KEYS = new Set(['api_key', 'provider_keys']);

function withoutSecrets(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    if (!SECRET_KEYS.has(key)) out[key] = withoutSecrets(child);
  }
  return out;
}

function findSecretPath(value, prefix = '') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  for (const [key, child] of Object.entries(value)) {
    const keyPath = prefix ? `${prefix}.${key}` : key;
    if (SECRET_KEYS.has(key)) return keyPath;
    const nested = findSecretPath(child, keyPath);
    if (nested) return nested;
  }
  return null;
}

export function viewConfig() {
  return { ref: 'config', ...withoutSecrets(getConfig()) };
}

export async function updateConfig(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail('config 的 data 必须是对象（局部补丁，如 { "global_system_prompt": "…" }）');
  requireObjectKeys(data, 'config 没有要修改的字段');
  const secret = findSecretPath(data);
  if (secret) fail(`不能修改密钥字段 ${secret}，请让用户在设置页自行填写`);
  await applyProposal(normalizeProposal({ type: 'global-config', operation: 'update', changes: data }));
  return `已更新全局设置：${Object.keys(data).join(', ')}`;
}
