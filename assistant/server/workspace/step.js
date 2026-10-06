// 落库步骤：校验阶段已备好提案，这里只负责执行并给出回执。

import { applyProposal } from '../apply-proposal.js';

/** receipt 可以是现成的回执，也可以是 (落库结果) => 回执 */
export function applyStep(proposal, receipt, worldRefId) {
  return async () => {
    const result = await applyProposal(proposal, worldRefId);
    return typeof receipt === 'function' ? receipt(result) : receipt;
  };
}
