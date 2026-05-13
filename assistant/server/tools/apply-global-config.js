// assistant/server/tools/apply-global-config.js
import { normalizeProposal, applyProposal } from '../normalize-proposal.js';

const FORBIDDEN = ['api_key'];

function stripForbidden(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = Array.isArray(obj) ? [] : {};
  for (const [k, v] of Object.entries(obj)) {
    if (FORBIDDEN.includes(k)) continue;
    out[k] = stripForbidden(v);
  }
  return out;
}

export const definition = {
  name: 'apply_global_config',
  description: '落库全局配置变更。仅支持 update；changes 内禁止 api_key 字段（自动剥离）。参数结构详见 CONTRACT.md / GLOBALPROMPT.md。',
  parameters: {
    type: 'object',
    properties: {
      changes: { type: 'object' },
      explanation: { type: 'string' },
    },
    required: ['changes'],
  },
};

export async function execute(args) {
  const proposal = {
    type: 'global-config',
    operation: 'update',
    changes: stripForbidden(args.changes ?? {}),
    explanation: args.explanation ?? '',
  };
  const normalized = normalizeProposal(proposal);
  await applyProposal(normalized, null);
  return { success: true, type: 'global-config', operation: 'update', summary: '更新全局配置' };
}
