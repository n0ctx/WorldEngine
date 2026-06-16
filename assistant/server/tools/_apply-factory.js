// apply_* 工具共享执行壳。
//
// 职责（item 2 + item 3 的工具边界部分）：
// - 把 normalizeProposal / applyProposal 抛出的字符串异常转成**结构化** tool result
//   `{ success:false, error_code, message }`，让模型据此自纠，而不是把异常冒泡到
//   completeWithTools 触发"盲目重试"（item 1 要对抗的重放压力源）。
// - 不改变各 apply 工具成功时的返回形态：成功结果由调用方提供的 buildResult(result, args) 决定。
//
// 错误分级（基于现有 throw 文案前缀，零行为漂移）：
// - 文案以"提案格式错误"开头 → error_code='invalid_proposal'（schema / 字段非法，模型可改参数重发）
// - 文案含"需要 / 缺少 / 缺失"且非格式错 → error_code='missing_target'（缺 entityId / worldId 等定位信息）
// - 其余（DB / 业务校验失败）→ error_code='apply_failed'
//
// 注意：本壳只负责"normalize + apply + 异常归一"，幂等去重在 sub-agent 的 apply 包装层做
// （那里持有跨重试存活的闭包 Map），此处不重复。

function classifyError(message) {
  const msg = String(message ?? '');
  if (/^提案格式错误/.test(msg)) return 'invalid_proposal';
  if (/(需要|缺少|缺失)/.test(msg)) return 'missing_target';
  return 'apply_failed';
}

/**
 * 运行 normalize → apply，吞掉抛错并转结构化结果。
 * @param {() => any} normalizeFn  返回归一化后的 proposal（可能 throw）
 * @param {(proposal:any) => Promise<any>} applyFn  落库（可能 throw）
 * @param {(result:any) => any} buildResult  成功时构造工具返回值
 */
export async function runApply(normalizeFn, applyFn, buildResult) {
  let normalized;
  try {
    normalized = normalizeFn();
  } catch (err) {
    const message = err?.message ?? String(err);
    return { success: false, error_code: classifyError(message), message };
  }
  let result;
  try {
    result = await applyFn(normalized);
  } catch (err) {
    const message = err?.message ?? String(err);
    return { success: false, error_code: classifyError(message), message };
  }
  return buildResult(result);
}
